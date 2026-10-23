import type { ScanSpan } from "@/reader/scan";
import type { Occurrence } from "@/languages/analysis";
import {
  detectLanguages,
  languageSample,
  languageTag,
} from "@/languages/detection";
import type { ScanResult } from "@/reader/contracts";
import { folded } from "@/languages/text";
import { blockSelector, createBlockReader, makeRange } from "@/reader/blocks";
import { readerClient } from "@/reader/client";
import type { ReaderHighlights } from "@/reader/highlights";
import type {
  Block,
  Pointer,
  ReaderOptions,
  ReaderConfiguration as Settings,
} from "@/reader/types";
import type { ReadingContext } from "@/vocabulary/model";
import type { WordState } from "@/vocabulary/state";

export function createScanner(
  root: HTMLElement,
  excluded: string,
  options: ReaderOptions,
  getSettings: () => Settings,
  isActive: () => boolean,
  highlights: ReaderHighlights,
) {
  const blocks = new Map<Element, Block>();
  const queued = new Set<Element>();
  const pageTexts = new Map<Element, string>();
  const wordStates = new Map<string, WordState>();
  const { matchesLanguage, readBlock } = createBlockReader(
    root,
    excluded,
    getSettings,
  );
  let scanning = false;
  let generation = 0;
  const parsed = new Map<string, ScanResult>();
  let scanTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let observer: MutationObserver | undefined;
  let queuedAt: number | undefined;
  let debounceResets = 0;
  let scanSequence = 0;
  function deleteBlock(element: Element) {
    const old = blocks.get(element);
    if (!old) return;
    for (const range of old.ranges)
      for (const highlight of highlights.values()) highlight.delete(range);
    blocks.delete(element);
  }
  function updateSpanState(span: ScanSpan) {
    const candidate = span.candidates[0];
    const state = candidate
      ? (wordStates.get(candidate.id) ?? candidate.state)
      : "unparsed";
    span.state =
      getSettings().ignoreProperNames &&
      span.properName &&
      (state === "unknown" || state === "unparsed")
        ? "ignored"
        : candidate?.tags.some((tag) => getSettings().ignoredTags.includes(tag))
          ? "ignored"
          : state;
  }
  function applyParsedTerm(
    term: string,
    candidates: ScanSpan["candidates"],
    language: string,
  ) {
    const escaped = term
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/gu, "\\s+");
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{M}\\p{N}_])${escaped}(?![\\p{L}\\p{M}\\p{N}_])`,
      "giu",
    );
    for (const block of blocks.values())
      if (block.language === language)
        for (const match of block.text.matchAll(pattern)) {
          if (
            block.spans.some(
              (span) =>
                span.occurrence &&
                span.start < match.index + match[0].length &&
                span.end > match.index,
            )
          )
            continue;
          const start = match.index;
          const end = start + match[0].length;
          if (
            block.spans.some(
              (span) =>
                span.start < end &&
                span.end > start &&
                (span.start !== start || span.end !== end),
            )
          )
            continue;
          const range = makeRange(block.parts, start, end);
          if (!range) continue;
          block.ranges = block.ranges.filter((old) => {
            if (
              old.compareBoundaryPoints(Range.START_TO_START, range) >= 0 &&
              old.compareBoundaryPoints(Range.END_TO_END, range) <= 0
            ) {
              for (const highlight of highlights.values())
                highlight.delete(old);
              return false;
            }
            return true;
          });
          block.spans = block.spans.filter(
            (span) => span.start !== start || span.end !== end,
          );
          const span = {
            start,
            end,
            term: match[0],
            ids: candidates.map((candidate) => candidate.id),
            candidates,
            state: candidates[0]!.state,
            range,
          };
          updateSpanState(span);
          block.spans.push(span);
          block.ranges.push(range);
          highlights.get(span.state)!.add(range);
        }
  }
  function applyParsedOccurrence(
    occurrence: Occurrence,
    candidates: ScanSpan["candidates"],
  ) {
    const matches = (span: ScanSpan) =>
      span.occurrence?.key === occurrence.key &&
      span.occurrence.start === occurrence.start &&
      span.occurrence.end === occurrence.end;
    const update = (span: ScanSpan) => {
      span.candidates = candidates;
      span.ids = candidates.map((candidate) => candidate.id);
      updateSpanState(span);
    };
    for (const result of parsed.values())
      for (const span of result.spans) if (matches(span)) update(span);
    for (const block of blocks.values())
      for (const span of block.spans) {
        if (!matches(span)) continue;
        highlights.get(span.state).delete(span.range);
        update(span);
        highlights.get(span.state).add(span.range);
      }
  }
  function queueBlock(element: Element, rebuildRanges = false) {
    if (element.closest(excluded)) return false;
    const previous = blocks.get(element);
    if (previous) {
      const { text, parts } = readBlock(element);
      if (text === previous.text) {
        const result = parsed.get(JSON.stringify([previous.language, text]));
        if (result && (!result.retryAt || result.retryAt > Date.now())) {
          if (
            rebuildRanges ||
            parts.length !== previous.parts.length ||
            parts.some((part, index) => {
              const old = previous.parts[index]!;
              return (
                part.node !== old.node ||
                part.start !== old.start ||
                part.end !== old.end
              );
            })
          )
            render(element, text, parts, result, generation);
          return false;
        }
      }
      deleteBlock(element);
    }
    queued.add(element);
    return true;
  }
  function collect(element: Element) {
    if (!isActive() || element.closest(excluded)) return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const candidates = new Set<Element>();
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (
        !parent ||
        !node.textContent?.trim() ||
        parent.closest(excluded) ||
        !matchesLanguage(parent)
      )
        continue;
      const block = parent.closest(blockSelector);
      if (block) candidates.add(block);
    }
    let changed = false;
    for (const block of candidates) changed = queueBlock(block) || changed;
    if (changed) schedule();
  }
  function schedule() {
    if (!queued.size) return;
    if (queued.size && queuedAt === undefined) {
      queuedAt = performance.now();
      console.info("[SrsReader] Scan queued", {
        blocks: queued.size,
        delayMs: 500,
      });
    }
    if (scanTimer !== undefined) debounceResets++;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = undefined;
      void drain();
    }, 500);
  }
  function render(
    element: Element,
    text: string,
    parts: Block["parts"],
    result: ScanResult,
    version: number,
  ) {
    deleteBlock(element);
    const block: Block = {
      language: result.language,
      text,
      parts,
      spans: [],
      ranges: [],
      generation: version,
    };
    blocks.set(element, block);
    for (const value of result.spans) {
      const span = { ...value };
      updateSpanState(span);
      const range = makeRange(parts, span.start, span.end);
      if (!range) continue;
      block.spans.push({ ...span, range });
      block.ranges.push(range);
      highlights.get(span.state).add(range);
    }
    if (
      getSettings().wordColorsEnabled &&
      getSettings().wordStyles.unparsed.mode !== "none"
    ) {
      let matched = 0;
      for (const segment of new Intl.Segmenter(block.language, {
        granularity: "word",
      }).segment(text)) {
        if (!segment.isWordLike) continue;
        while (
          block.spans[matched] &&
          block.spans[matched]!.end <= segment.index
        )
          matched++;
        if (
          block.spans[matched] &&
          block.spans[matched]!.start <= segment.index
        )
          continue;
        const range = makeRange(
          parts,
          segment.index,
          segment.index + segment.segment.length,
        );
        if (range) {
          block.ranges.push(range);
          highlights.get("unparsed").add(range);
        }
      }
    }
  }
  function scheduleRetry() {
    clearTimeout(retryTimer);
    const expires = [...parsed.values()].flatMap((result) =>
      result.retryAt ? [result.retryAt] : [],
    );
    if (!expires.length) return;
    retryTimer = setTimeout(
      () => {
        for (const [text, result] of parsed) {
          if (!result.retryAt || result.retryAt > Date.now()) continue;
          parsed.delete(text);
          for (const [element, block] of blocks)
            if (block.text === text) queued.add(element);
        }
        schedule();
      },
      Math.max(0, Math.min(...expires) - Date.now()),
    );
  }
  async function drain() {
    if (scanning || !isActive()) return;
    scanning = true;
    const version = generation;
    const started = performance.now();
    const scan = ++scanSequence;
    let outcome = "stale";
    console.info("[SrsReader] Scan started", {
      scan,
      context: options.onLookup ? "popup" : "page",
      blocks: queued.size,
      debounceMs: queuedAt === undefined ? 0 : Math.round(started - queuedAt),
      debounceResets,
      sinceNavigationMs: Math.round(started),
    });
    queuedAt = undefined;
    debounceResets = 0;
    try {
      const snapshots = [...queued].flatMap((element) => {
        if (!element.isConnected) {
          pageTexts.delete(element);
          deleteBlock(element);
          return [];
        }
        const { text, parts } = readBlock(element);
        if (!text.trim()) {
          pageTexts.delete(element);
          deleteBlock(element);
          return [];
        }
        pageTexts.set(element, text);
        return [{ element, text, parts }];
      });
      queued.clear();
      console.info("[SrsReader] Text collected", {
        scan,
        blocks: snapshots.length,
        characters: snapshots.reduce(
          (count, block) => count + block.text.length,
          0,
        ),
        elapsedMs: Math.round(performance.now() - started),
      });
      const preferences = getSettings();
      const [detectedPage, ...detectedBlocks] = snapshots.length
        ? await detectLanguages([
            languageSample(
              [...pageTexts.values()].map(languageSample).join("\n"),
            ),
            ...snapshots.map((block) => block.text),
          ])
        : [];
      if (generation !== version || !isActive()) return;
      const pageLanguage = detectedPage || languageTag(root);
      const eligible = snapshots.flatMap((snapshot, index) => {
        const marked = snapshot.element.closest(
          "[lang],[data-reading-language]",
        );
        const declared =
          marked && root.contains(marked) && marked !== root
            ? languageTag(marked)
            : null;
        const language =
          declared || detectedBlocks[index] || options.language || pageLanguage;
        if (!language || !preferences.studyLanguages.includes(language)) {
          deleteBlock(snapshot.element);
          return [];
        }
        return snapshot.element.isConnected &&
          readBlock(snapshot.element).text === snapshot.text
          ? [{ ...snapshot, language }]
          : [];
      });
      const key = (language: string, text: string) =>
        JSON.stringify([language, text]);
      const groups = new Map<string, Set<string>>();
      for (const snapshot of eligible) {
        const hit = parsed.get(key(snapshot.language, snapshot.text));
        if (hit && (!hit.retryAt || hit.retryAt > Date.now())) continue;
        const texts = groups.get(snapshot.language) || new Set<string>();
        texts.add(snapshot.text);
        groups.set(snapshot.language, texts);
      }
      await Promise.all(
        [...groups].map(async ([language, texts]) => {
          const missing = [...texts];
          const results = await readerClient({
            action: "scan",
            language,
            texts: missing,
          });
          if (generation !== version || !isActive()) return;
          for (const [index, text] of missing.entries())
            parsed.set(key(language, text), results[index]!);
        }),
      );
      if (generation !== version || !isActive()) return;
      const renderStarted = performance.now();
      let coloredBlocks = 0;
      let coloredWords = 0;
      let udpipeWords = 0;
      for (const snapshot of eligible) {
        const current = readBlock(snapshot.element);
        if (!snapshot.element.isConnected || current.text !== snapshot.text)
          continue;
        const result = parsed.get(key(snapshot.language, snapshot.text));
        if (result) {
          render(
            snapshot.element,
            snapshot.text,
            current.parts,
            result,
            version,
          );
          queued.delete(snapshot.element);
          coloredBlocks++;
          coloredWords += result.spans.length;
          udpipeWords += result.spans.filter((span) => span.occurrence).length;
        }
      }
      outcome = "colored";
      console.info("[SrsReader] Words colored", {
        scan,
        blocks: coloredBlocks,
        words: coloredWords,
        udpipeWords,
        colorsEnabled: getSettings().wordColorsEnabled,
        readerCacheHits:
          eligible.length -
          [...groups.values()].reduce((count, texts) => count + texts.size, 0),
        renderMs: Math.round(performance.now() - renderStarted),
      });
      scheduleRetry();
    } catch (error) {
      outcome = "failed";
      console.warn("SrsReader:", error);
    } finally {
      console.info("[SrsReader] Scan finished", {
        scan,
        outcome,
        totalMs: Math.round(performance.now() - started),
        queuedBlocks: queued.size,
      });
      scanning = false;
      if (queued.size) schedule();
    }
  }
  function contextFor(
    block: Block,
    span: Pick<ScanSpan, "start" | "end">,
  ): ReadingContext {
    const source = block.parts[0]?.node.parentElement?.closest<HTMLElement>(
      "[data-reading-source-url]",
    );
    const segments = new Intl.Segmenter(block.language, {
      granularity: "sentence",
    }).segment(block.text);
    const segment = [...segments].find(
      (s) => span.start >= s.index && span.start < s.index + s.segment.length,
    );
    const start = segment?.index || 0;
    const sentence = segment?.segment || block.text;
    return {
      language: block.language,
      sentence,
      surface: block.text.slice(span.start, span.end),
      start: span.start - start,
      end: span.end - start,
      url:
        source?.dataset.readingSourceUrl ||
        options.source?.url ||
        location.href,
      title:
        source?.dataset.readingSourceTitle ||
        options.source?.title ||
        document.title,
      mined: Date.now(),
    };
  }
  function wordAtPointer(pointer: Pointer | undefined) {
    if (
      !isActive() ||
      !pointer ||
      (pointer.target as Element)?.closest(excluded)
    )
      return;
    const caret = document.caretPositionFromPoint(
      pointer.clientX,
      pointer.clientY,
    );
    if (!caret || caret.offsetNode.nodeType !== Node.TEXT_NODE) return;
    const element = caret.offsetNode.parentElement?.closest(blockSelector);
    const block = element && blocks.get(element);
    if (!block) return;
    const part = block.parts.find((part) => part.node === caret.offsetNode);
    if (!part) return;
    const offset = part.start + caret.offset;
    let span:
      | Pick<ScanSpan, "start" | "end" | "term" | "occurrence" | "related">
      | undefined = block.spans.find(
      (span) => offset >= span.start && offset < span.end,
    );
    if (!span) {
      const segment = [
        ...new Intl.Segmenter(block.language, {
          granularity: "word",
        }).segment(block.text),
      ].find(
        (segment) =>
          segment.isWordLike &&
          offset >= segment.index &&
          offset < segment.index + segment.segment.length,
      );
      if (segment)
        span = {
          start: segment.index,
          end: segment.index + segment.segment.length,
          term: segment.segment,
        };
    }
    if (!span) return;
    if (block.language === "cs" && !span.occurrence) {
      const segments = [
        ...new Intl.Segmenter(block.language, {
          granularity: "word",
        }).segment(block.text),
      ].filter((segment) => segment.isWordLike);
      const current = segments.find(
        (segment) =>
          segment.index === span!.start &&
          segment.index + segment.segment.length === span!.end,
      );
      const index = current ? segments.indexOf(current) : -1;
      const next = index >= 0 ? segments[index + 1] : undefined;
      const adjacent =
        current &&
        folded(current.segment, "cs") !== "se" &&
        next &&
        folded(next.segment, "cs") === "se" &&
        !block.text
          .slice(current.index + current.segment.length, next.index)
          .trim()
          ? next
          : undefined;
      if (current && adjacent) {
        const start = Math.min(current.index, adjacent.index);
        const end = Math.max(
          current.index + current.segment.length,
          adjacent.index + adjacent.segment.length,
        );
        span = { start, end, term: block.text.slice(start, end) };
      }
    }
    const range = makeRange(block.parts, span.start, span.end);
    if (
      !range ||
      ![...range.getClientRects()].some(
        (rect) =>
          pointer!.clientX >= rect.left &&
          pointer!.clientX <= rect.right &&
          pointer!.clientY >= rect.top &&
          pointer!.clientY <= rect.bottom,
      )
    )
      return;
    return {
      term: span.term,
      range,
      context: contextFor(block, span),
      occurrence: span.occurrence,
      focusRanges: span.related?.flatMap(({ start, end }) => {
        const range = makeRange(block.parts, start, end);
        return range ? [range] : [];
      }),
    };
  }
  function selectedWord() {
    const selection = getSelection();
    if (
      !selection?.rangeCount ||
      selection.isCollapsed ||
      !selection.toString().trim() ||
      selection.toString().length > 1000
    )
      return;
    const range = selection.getRangeAt(0).cloneRange();
    if (
      !root.contains(range.startContainer) ||
      range.startContainer.parentElement?.closest(excluded) ||
      (options.onLookup &&
        (!matchesLanguage(range.startContainer.parentElement!) ||
          !matchesLanguage(range.endContainer.parentElement!)))
    )
      return;
    const term = selection.toString().trim();
    const element = range.startContainer.parentElement?.closest(blockSelector);
    const block = element && blocks.get(element);
    const first = block?.parts.find(
      (part) => part.node === range.startContainer,
    );
    const last = block?.parts.find((part) => part.node === range.endContainer);
    const context =
      block && first && last
        ? contextFor(block, {
            start: first.start + range.startOffset,
            end: last.start + range.endOffset,
          })
        : {
            language:
              languageTag(range.startContainer.parentElement!) ||
              options.language ||
              getSettings().studyLanguages[0],
            sentence: term,
            surface: term,
            start: 0,
            end: term.length,
            url: options.source?.url || location.href,
            title: options.source?.title || document.title,
            mined: Date.now(),
          };
    const span =
      block && first && last
        ? block.spans.find(
            (span) =>
              span.start === first.start + range.startOffset &&
              span.end === last.start + range.endOffset,
          )
        : undefined;
    return {
      term,
      range,
      context,
      occurrence: span?.occurrence,
      focusRanges: span?.related?.flatMap(({ start, end }) => {
        const range = makeRange(block!.parts, start, end);
        return range ? [range] : [];
      }),
    };
  }
  function clear() {
    generation++;
    observer?.disconnect();
    clearTimeout(scanTimer);
    clearTimeout(retryTimer);
    scanTimer = undefined;
    queuedAt = undefined;
    debounceResets = 0;
    parsed.clear();
    pageTexts.clear();
    queued.clear();
    wordStates.clear();
    for (const element of blocks.keys()) deleteBlock(element);
  }
  function reset() {
    clear();
    if (!isActive()) return;
    observer = new MutationObserver((records) => {
      for (const record of records) {
        const element =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        if (element?.closest("[data-srs-reader]")) continue;
        if (element && record.type === "attributes") {
          for (const block of pageTexts.keys())
            if (element === block || element.contains(block))
              pageTexts.delete(block);
          for (const block of blocks.keys())
            if (element === block || element.contains(block)) {
              deleteBlock(block);
            }
          collect(element);
          continue;
        }
        if (element) {
          const block = element.closest(blockSelector);
          if (
            block &&
            blocks.has(block) &&
            queueBlock(block, record.type === "characterData")
          )
            schedule();
        }
        if (element && record.type === "characterData") collect(element);
        for (const added of record.addedNodes)
          if (added instanceof Element) collect(added);
          else if (added.parentElement) collect(added.parentElement);
      }
      for (const element of blocks.keys())
        if (!element.isConnected) {
          deleteBlock(element);
        }
      for (const element of pageTexts.keys())
        if (!element.isConnected) pageTexts.delete(element);
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "lang",
        "data-reading-language",
        "hidden",
        "aria-hidden",
      ],
    });
    if (root === document.body)
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["lang"],
      });
    collect(root);
  }
  function refreshTags() {
    for (const block of blocks.values())
      for (const span of block.spans) {
        highlights.get(span.state).delete(span.range);
        updateSpanState(span);
        highlights.get(span.state).add(span.range);
      }
  }
  function updateWord(id: string, state: WordState) {
    wordStates.set(id, state);
    for (const block of blocks.values())
      for (const span of block.spans) {
        if (span.ids[0] !== id || span.state === state) continue;
        highlights.get(span.state).delete(span.range);
        updateSpanState(span);
        highlights.get(span.state).add(span.range);
      }
  }
  return {
    collect,
    wordAtPointer,
    selectedWord,
    reset,
    refreshTags,
    updateWord,
    applyParsedTerm,
    applyParsedOccurrence,
    dispose: clear,
  };
}
export type ReaderScanner = ReturnType<typeof createScanner>;
