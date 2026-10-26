import type { ScanSpan } from "@/reader/scan";
import { dictionariesClient } from "@/dictionaries/client";
import type { Occurrence } from "@/languages/analysis";
import {
  detectLanguages,
  languageSample,
  languageTag,
  knownLanguage,
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
  let session = crypto.randomUUID();
  const parsed = new Map<string, ScanResult>();
  let scanTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let observer: MutationObserver | undefined;
  let queuedAt: number | undefined;
  let debounceResets = 0;
  let scanSequence = 0;
  let pageLanguage: string | null | undefined;

  function readingLanguage(language: string | null | undefined) {
    const studied = getSettings().studyLanguages;
    if (language === "no" && !studied.includes("no") && studied.includes("nb"))
      return "nb";
    if (language === "nb" && !studied.includes("nb") && studied.includes("no"))
      return "no";
    return language;
  }

  // Lookup must also work before scanning finishes, on unknown pages, and when
  // automatic popup scanning is off. These snapshots do not create highlights.
  function lookupBlock(
    element: Element,
    start: Node,
    end = start,
  ): Block | undefined {
    if (!root.contains(element)) return;
    const marked = (
      start instanceof Element ? start : start.parentElement
    )?.closest("[lang],[data-reading-language]");
    const declared =
      marked &&
      root.contains(marked) &&
      (marked !== root || marked.hasAttribute("data-reading-language"))
        ? languageTag(marked)
        : null;
    const previous = blocks.get(element);
    if (
      previous &&
      !queued.has(element) &&
      (!declared || declared === previous.language) &&
      [start, end].every((node) =>
        previous.parts.some((part) => part.node === node),
      )
    )
      return previous;
    const { text, parts } = readBlock(element, true);
    if (!text.trim() || !parts.length) return;
    if (
      previous?.text === text &&
      (!declared || declared === previous.language)
    )
      return { ...previous, parts };
    const guessed = knownLanguage(text);
    if (
      !declared &&
      !guessed &&
      !options.language &&
      pageLanguage === undefined
    )
      pageLanguage = knownLanguage(root.innerText);
    const language = readingLanguage(
      declared ||
        guessed ||
        options.language ||
        pageLanguage ||
        languageTag(element) ||
        getSettings().studyLanguages[0],
    );
    if (!language) return;
    return { language, text, parts, spans: [], ranges: [], generation };
  }
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
          const key = JSON.stringify([language, block.text]);
          parsed.set(key, {
            ...parsed.get(key),
            language,
            spans: block.spans.map(({ range: _range, ...span }) => span),
          });
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
        const result = parsed.get(
          JSON.stringify([previous.language, text]),
        ) || {
          language: previous.language,
          spans: previous.spans,
        };
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
      let prefix = 0;
      while (
        prefix < text.length &&
        prefix < previous.text.length &&
        text[prefix] === previous.text[prefix]
      )
        prefix++;
      let suffix = 0;
      while (
        suffix < text.length - prefix &&
        suffix < previous.text.length - prefix &&
        text[text.length - suffix - 1] ===
          previous.text[previous.text.length - suffix - 1]
      )
        suffix++;
      const shift = text.length - previous.text.length;
      const spans = previous.spans.flatMap((span) => {
        const offset =
          span.end <= prefix
            ? 0
            : span.start >= previous.text.length - suffix
              ? shift
              : undefined;
        return offset === undefined
          ? []
          : [
              {
                ...span,
                start: span.start + offset,
                end: span.end + offset,
                occurrence: undefined,
                related: undefined,
              },
            ];
      });
      render(
        element,
        text,
        parts,
        { language: previous.language, spans },
        generation,
      );
    }
    queued.add(element);
    return true;
  }
  function collect(element: Element) {
    if (
      !isActive() ||
      (options.onLookup && !getSettings().scanPopups) ||
      element.closest(excluded)
    )
      return;
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
    if (scanTimer !== undefined) {
      debounceResets++;
      return;
    }
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
    const previous = blocks.get(element);
    const partsByNode = new Map(parts.map((part) => [part.node, part]));
    const states = new Map(
      previous?.spans.map((span) => [span.range, span.state]),
    );
    const reusable = new Map<string, Range>();
    for (const range of previous?.ranges || []) {
      const first = partsByNode.get(range.startContainer as Text);
      const last = partsByNode.get(range.endContainer as Text);
      if (first && last)
        reusable.set(
          JSON.stringify([
            first.start + range.startOffset,
            last.start + range.endOffset,
            states.get(range) || "unparsed",
          ]),
          range,
        );
    }
    const rangeFor = (start: number, end: number, state: ScanSpan["state"]) =>
      reusable.get(JSON.stringify([start, end, state])) ||
      makeRange(parts, start, end);
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
      const range = rangeFor(span.start, span.end, span.state);
      if (!range) continue;
      block.spans.push({ ...span, range });
      block.ranges.push(range);
      highlights.get(span.state).add(range);
    }
    if (getSettings().wordLoading[block.language] !== "onLookup") {
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
        const range = rangeFor(
          segment.index,
          segment.index + segment.segment.length,
          "unparsed",
        );
        if (range) {
          block.ranges.push(range);
          highlights.get("unparsed").add(range);
        }
      }
    }
    const retained = new Set(block.ranges);
    for (const range of previous?.ranges || [])
      if (!retained.has(range))
        for (const highlight of highlights.values()) highlight.delete(range);
  }
  function applyScanResult(id: string, text: string, result: ScanResult) {
    if (id !== session || !isActive()) return;
    const key = JSON.stringify([result.language, text]);
    if (JSON.stringify(parsed.get(key)) === JSON.stringify(result)) return;
    parsed.set(key, result);
    for (const [element, block] of blocks) {
      if (block.language !== result.language || !block.text.includes(text))
        continue;
      const current = readBlock(element);
      if (!element.isConnected || current.text !== block.text) continue;
      if (block.text === text) {
        render(element, text, current.parts, result, generation);
        continue;
      }
      const sentences = [
        ...new Intl.Segmenter(block.language, {
          granularity: "sentence",
        }).segment(block.text),
      ].filter((sentence) => sentence.segment === text);
      if (!sentences.length) continue;
      const spans = block.spans
        .filter((span) =>
          sentences.every(
            ({ index }) =>
              span.end <= index || span.start >= index + text.length,
          ),
        )
        .map(({ range: _range, ...span }) => span);
      for (const { index } of sentences)
        spans.push(
          ...result.spans.map((span) => ({
            ...span,
            start: span.start + index,
            end: span.end + index,
            related: span.related?.map(({ start, end }) => ({
              start: start + index,
              end: end + index,
            })),
          })),
        );
      spans.sort((a, b) => a.start - b.start);
      const merged = { ...result, spans };
      parsed.set(JSON.stringify([block.language, block.text]), merged);
      render(element, block.text, current.parts, merged, generation);
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
      pageLanguage = detectedPage || options.language || languageTag(root);
      const eligible = snapshots.flatMap((snapshot, index) => {
        const marked = snapshot.element.closest(
          "[lang],[data-reading-language]",
        );
        const declared =
          marked && root.contains(marked) && marked !== root
            ? languageTag(marked)
            : null;
        const language = readingLanguage(
          declared || detectedBlocks[index] || options.language || pageLanguage,
        );
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
      for (const snapshot of eligible)
        if (blocks.get(snapshot.element)?.text !== snapshot.text)
          render(
            snapshot.element,
            snapshot.text,
            readBlock(snapshot.element).parts,
            { language: snapshot.language, spans: [] },
            version,
          );
      const groups = new Map<string, Set<string>>();
      for (const snapshot of eligible) {
        if (preferences.wordLoading[snapshot.language] === "onLookup") continue;
        const hit = parsed.get(key(snapshot.language, snapshot.text));
        if (hit && (!hit.retryAt || hit.retryAt > Date.now())) continue;
        parsed.delete(key(snapshot.language, snapshot.text));
        const texts = groups.get(snapshot.language) || new Set<string>();
        texts.add(snapshot.text);
        groups.set(snapshot.language, texts);
      }
      await Promise.all(
        [...groups].map(async ([language, texts]) => {
          const missing = [...texts];
          const results = await readerClient({
            action: "scan",
            source:
              options.onLookup || options.scope === "extensionPages"
                ? "popup"
                : "website",
            lookup: false,
            session,
            language,
            texts: missing,
          });
          if (generation !== version || !isActive()) return;
          for (const [index, text] of missing.entries())
            if (!parsed.has(key(language, text)))
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
    const containing = segments.containing(span.start);
    const segment =
      containing && span.end <= containing.index + containing.segment.length
        ? containing
        : undefined;
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
    if (
      !caret ||
      caret.offsetNode.nodeType !== Node.TEXT_NODE ||
      !root.contains(caret.offsetNode) ||
      caret.offsetNode.parentElement?.closest(excluded)
    )
      return;
    const element = caret.offsetNode.parentElement?.closest(blockSelector);
    const block =
      element &&
      lookupBlock(root.contains(element) ? element : root, caret.offsetNode);
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
      const segment = new Intl.Segmenter(block.language, {
        granularity: "word",
      })
        .segment(block.text)
        .containing(offset);
      if (segment?.isWordLike)
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
      !root.contains(range.endContainer) ||
      range.startContainer.parentElement?.closest(excluded) ||
      range.endContainer.parentElement?.closest(excluded)
    )
      return;
    const term = selection.toString().trim();
    const element = range.startContainer.parentElement?.closest(blockSelector);
    const block =
      element &&
      lookupBlock(
        root.contains(element) ? element : root,
        range.startContainer,
        range.endContainer,
      );
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
              block?.language ||
              options.language ||
              knownLanguage(term) ||
              languageTag(range.startContainer.parentElement!) ||
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
  async function prepareLookup(
    word: NonNullable<ReturnType<typeof wordAtPointer>>,
  ) {
    const { context, range } = word;
    const languages = getSettings().studyLanguages;
    if (
      !options.language &&
      (!context.language || !languages.includes(context.language))
    ) {
      const matches = await Promise.all(
        languages.map((language) =>
          dictionariesClient({
            action: "lookup",
            language,
            term: word.term,
            localOnly: true,
          }),
        ),
      );
      const index = matches.findIndex((result) => result.words.length > 0);
      return {
        ...word,
        context: {
          ...context,
          language: languages[index < 0 ? 0 : index]!,
        },
        occurrence: undefined,
      };
    }
    if (
      !context.language ||
      getSettings().wordLoading[context.language] !== "onLookup" ||
      word.occurrence
    )
      return word;
    const parent = range.startContainer.parentElement?.closest(blockSelector);
    const element = parent && root.contains(parent) ? parent : root;
    const block = lookupBlock(
      element,
      range.startContainer,
      range.endContainer,
    );
    const first = block?.parts.find(
      (part) => part.node === range.startContainer,
    );
    if (!block || !first) return word;
    const offset = first.start + range.startOffset - context.start;
    render(
      element,
      block.text,
      block.parts,
      {
        language: block.language,
        spans: block.spans,
      },
      generation,
    );
    const id = session;
    const key = JSON.stringify([context.language, context.sentence]);
    parsed.delete(key);
    const [result] = await readerClient({
      action: "scan",
      source:
        options.onLookup || options.scope === "extensionPages"
          ? "popup"
          : "website",
      lookup: true,
      session: id,
      language: context.language,
      texts: [context.sentence],
    });
    if (session !== id || readBlock(element).text !== block.text) return word;
    const ready = parsed.get(key) || result!;
    applyScanResult(id, context.sentence, ready);
    const span =
      ready.spans.find(
        (span) => span.start <= context.start && span.end >= context.end,
      ) ||
      ready.spans.find(
        (span) =>
          span.start === context.start &&
          span.related?.some(({ end }) => end === context.end),
      );
    if (!span) return word;
    return {
      term: span.term,
      range:
        makeRange(block.parts, offset + span.start, offset + span.end) || range,
      context: {
        ...context,
        surface: span.term,
        start: span.start,
        end: span.end,
      },
      occurrence: span.occurrence,
      focusRanges: span.related?.flatMap(({ start, end }) => {
        const range = makeRange(block.parts, offset + start, offset + end);
        return range ? [range] : [];
      }),
    };
  }
  function clear() {
    generation++;
    pageLanguage = undefined;
    session = crypto.randomUUID();
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
    if (!isActive() || (options.onLookup && !getSettings().scanPopups)) return;
    observer = new MutationObserver((records) => {
      for (const record of records) {
        const element =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        if (element?.closest("[data-srs-reader]")) continue;
        if (element && record.type === "attributes") {
          for (const block of blocks.keys())
            if (element === block || element.contains(block)) {
              if (
                record.attributeName === "lang" ||
                record.attributeName === "data-reading-language"
              )
                queued.add(block);
              else queueBlock(block);
            }
          collect(element);
          if (queued.size) schedule();
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
    prepareLookup,
    reset,
    refreshTags,
    updateWord,
    applyParsedTerm,
    applyParsedOccurrence,
    applyScanResult,
    dispose: clear,
  };
}
export type ReaderScanner = ReturnType<typeof createScanner>;
