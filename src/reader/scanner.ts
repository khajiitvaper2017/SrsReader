import type { ScanSpan } from "@/reader/scan";
import { dictionariesClient } from "@/dictionaries/client";
import type { Occurrence } from "@/languages/analysis";
import type { LookupPage } from "@/lookup/model";
import { numeralAt, parseNumeral } from "@/languages/numerals";
import {
  detectLanguages,
  languageSample,
  languageTag,
  knownLanguage,
} from "@/languages/detection";
import type { ScanResult } from "@/reader/contracts";
import {
  folded,
  germanHyphenatedCompounds,
  germanInitialAbbreviations,
  hasGermanSuspensionHyphen,
  spacedGermanAbbreviation,
} from "@/languages/text";
import { blockSelector, createBlockReader, makeRange } from "@/reader/blocks";
import { readerClient } from "@/reader/client";
import type { ReaderHighlights } from "@/reader/highlights";
import { createScanScheduler } from "@/reader/scan-scheduler";
import type {
  Block,
  Pointer,
  ReaderOptions,
  ReaderConfiguration as Settings,
} from "@/reader/types";
import type { ReadingContext } from "@/vocabulary/model";
import { stateForEncounter, type WordStateUpdate } from "@/vocabulary/state";

function originalCompound(
  context: ReadingContext,
  part: ScanSpan["compoundPart"],
) {
  if (!part) return;
  const start = context.start - part.before;
  const end = context.end + part.after;
  return {
    context: {
      ...context,
      start,
      end,
      surface: context.sentence.slice(start, end),
    },
    occurrence: part.occurrence,
    term: part.headword ?? context.sentence.slice(start, end),
  };
}

type LookupTarget = {
  term: string;
  range: Range;
  context: ReadingContext;
  pointerIndex?: number;
  requirePhrase?: boolean;
  refineContext?: boolean;
  compound?: LookupPage["compound"];
  occurrence?: Occurrence;
  focusRanges?: Range[];
};

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
  const website = !options.onLookup && options.scope !== "extensionPages";
  const visible = new Set<Element>();
  const observed = new Set<Element>();
  const textVisibility = new Map<
    Element,
    { block: Element; visible: boolean }
  >();
  const encoder = new TextEncoder();
  let viewport: IntersectionObserver | undefined;
  let starting = website;
  let firstVisibleBatch = true;
  let firstVisible = true;
  const wordStates = new Map<string, WordStateUpdate>();
  const { matchesLanguage, readBlock } = createBlockReader(
    root,
    excluded,
    getSettings,
  );
  let scanning = false;
  let generation = 0;
  let session = crypto.randomUUID();
  // Live highlights can contain just one lookup. Cache only scan results.
  const parsed = new Map<string, ScanResult>();
  const scanScheduler = createScanScheduler(() => void drain());
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let observer: MutationObserver | undefined;
  let queuedAt: number | undefined;
  function newProfile() {
    return {
      started: queuedAt ?? performance.now(),
      batches: 0,
      blocks: 0,
      bytes: 0,
      readerCacheHits: 0,
      failedGroups: 0,
      queueMs: 0,
      readBlocksMs: 0,
      detectionMs: 0,
      requestWallMs: 0,
      highlightMs: 0,
      firstVisibleSinceNavigationMs: undefined as number | undefined,
      worker: new Map<string, number>(),
    };
  }
  let profile: ReturnType<typeof newProfile> | undefined;
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
      !website &&
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
    for (const candidate of span.candidates) {
      const snapshot = wordStates.get(candidate.id);
      if (snapshot)
        candidate.state = stateForEncounter(
          snapshot,
          span.encounterKey,
          getSettings().matureIntervalDays,
        );
    }
    const candidate = span.candidates[0];
    const state = candidate?.state ?? "unparsed";
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
    encounterKey: string,
  ) {
    const lookupTerm = term.trim();
    const spaces = lookupTerm.match(/\s+/gu) ?? [];
    const escaped = lookupTerm
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/gu, "\\s+");
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{M}\\p{N}_])${escaped}(?![\\p{L}\\p{M}\\p{N}_])`,
      "giu",
    );
    for (const block of blocks.values())
      if (block.language === language)
        for (const match of block.text.matchAll(pattern)) {
          const start = match.index;
          const end = start + match[0].length;
          if (
            block.spans.some(
              (span) =>
                span.start < end &&
                span.end > start &&
                (span.occurrence || span.start !== start || span.end !== end),
            )
          )
            continue;
          const index = block.spans.findIndex((span) => span.start >= start);
          const next = block.spans[index];
          const previous = next?.start === start ? next : undefined;
          let gap = 0;
          // Keep the page's capitalization and the dictionary's spacing.
          const matchedTerm = match[0].replace(/\s+/gu, () => spaces[gap++]!);
          if (
            previous?.term === matchedTerm &&
            previous.encounterKey === encounterKey &&
            JSON.stringify(previous.candidates) === JSON.stringify(candidates)
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
          const span = {
            ...previous,
            start,
            end,
            term: matchedTerm,
            encounterKey,
            ids: candidates.map((candidate) => candidate.id),
            candidates,
            state: candidates[0]!.state,
            range,
          };
          updateSpanState(span);
          if (index < 0) block.spans.push(span);
          else block.spans.splice(index, previous ? 1 : 0, span);
          block.ranges.push(range);
          highlights.get(span.state)!.add(range);
        }
  }
  function applyParsedOccurrence(
    occurrence: Occurrence,
    candidates: ScanSpan["candidates"],
    encounterKey: string,
  ) {
    const matches = (span: ScanSpan) =>
      span.occurrence?.key === occurrence.key &&
      span.occurrence.start === occurrence.start &&
      span.occurrence.end === occurrence.end;
    const update = (span: ScanSpan) => {
      span.encounterKey = encounterKey;
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
          render(element, text, parts, previous, generation);
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
        const start = span.start - (span.compoundPart?.before ?? 0);
        const end = span.end + (span.compoundPart?.after ?? 0);
        const offset =
          end <= prefix
            ? 0
            : start >= previous.text.length - suffix
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
                compoundPart: span.compoundPart && {
                  ...span.compoundPart,
                  occurrence: undefined,
                },
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
    if (viewport && !observed.has(element)) {
      observed.add(element);
      viewport.observe(element);
    }
    return true;
  }
  function trackVisibility(parent: Element, block: Element) {
    if (textVisibility.get(parent)?.block !== block)
      textVisibility.set(parent, {
        block,
        visible:
          !parent.matches("details:not([open])") &&
          parent.checkVisibility({ checkVisibilityCSS: true }),
      });
  }
  function collectBlocks(element: Element, candidates: Set<Element>) {
    if (
      !isActive() ||
      (options.onLookup && !getSettings().scanPopups) ||
      element.closest(excluded)
    )
      return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
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
      if (block) {
        trackVisibility(parent, block);
        candidates.add(block);
      }
    }
  }
  function collect(element: Element) {
    const candidates = new Set<Element>();
    collectBlocks(element, candidates);
    let changed = false;
    for (const block of candidates) changed = queueBlock(block) || changed;
    if (changed) schedule();
  }
  function schedule() {
    if (scanning || !queued.size || (starting && website)) return;
    let background = website;
    for (const element of visible)
      if (queued.has(element)) {
        background = false;
        break;
      }
    queuedAt ??= performance.now();
    scanScheduler.schedule(background);
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
      const highlight = highlights.get(span.state);
      if (!highlight.has(range)) highlight.add(range);
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
          const highlight = highlights.get("unparsed");
          if (!highlight.has(range)) highlight.add(range);
        }
      }
    }
    const retained = new Set(block.ranges);
    for (const range of previous?.ranges || [])
      if (!retained.has(range))
        for (const highlight of highlights.values()) highlight.delete(range);
  }
  function applyScanResult(
    id: string,
    text: string,
    result: ScanResult,
    target?: Element,
  ) {
    if (id !== session || !isActive()) return;
    const key = scanKey(result.language, text);
    if (!target && JSON.stringify(parsed.get(key)) === JSON.stringify(result))
      return;
    parsed.set(key, result);
    const targets = target ? [[target, blocks.get(target)] as const] : blocks;
    for (const [element, block] of targets) {
      if (
        !block ||
        block.language !== result.language ||
        !block.text.includes(text)
      )
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
      render(
        element,
        block.text,
        current.parts,
        { language: block.language, spans },
        generation,
      );
    }
  }
  function scanKey(language: string, text: string) {
    return JSON.stringify([language, text]);
  }
  function scheduleRetry() {
    clearTimeout(retryTimer);
    const expires = [...parsed.values()].flatMap((result) =>
      result.retryAt ? [result.retryAt] : [],
    );
    if (!expires.length) return;
    retryTimer = setTimeout(
      () => {
        for (const [key, result] of parsed) {
          if (!result.retryAt || result.retryAt > Date.now()) continue;
          parsed.delete(key);
          for (const [element, block] of blocks)
            if (scanKey(block.language, block.text) === key)
              queued.add(element);
        }
        schedule();
      },
      Math.max(0, Math.min(...expires) - Date.now()),
    );
  }
  async function drain() {
    if (scanning || !isActive() || !queued.size) return;
    scanning = true;
    const version = generation;
    const started = performance.now();
    if (!profile) {
      profile = newProfile();
      console.log("[SrsReader] Scan started", {
        context: website ? "website" : "popup",
        queuedBlocks: queued.size,
      });
    }
    const stats = profile;
    stats.batches++;
    stats.queueMs += queuedAt === undefined ? 0 : started - queuedAt;
    queuedAt = undefined;
    const current = () => generation === version && isActive();
    try {
      const inView = [...queued].filter((element) => visible.has(element));
      const prioritize = inView.length > 0;
      const candidates = prioritize ? inView : queued;
      const blockLimit = website && prioritize && firstVisibleBatch ? 1 : 8;
      const byteLimit = 8 * 1024;
      const snapshots = [];
      let bytes = 0;
      for (const element of candidates) {
        if (!element.isConnected) {
          queued.delete(element);
          deleteBlock(element);
          continue;
        }
        const { text } = readBlock(element);
        if (!text.trim()) {
          queued.delete(element);
          deleteBlock(element);
          continue;
        }
        const size = encoder.encode(text).length;
        if (snapshots.length && bytes + size > byteLimit) break;
        queued.delete(element);
        bytes += size;
        const marked = element.closest("[lang],[data-reading-language]");
        const declared =
          marked &&
          root.contains(marked) &&
          (marked !== root || marked.hasAttribute("data-reading-language"))
            ? languageTag(marked)
            : null;
        snapshots.push({ element, text, declared });
        if (snapshots.length >= blockLimit) break;
      }

      const detectionStarted = performance.now();
      stats.readBlocksMs += detectionStarted - started;
      stats.blocks += snapshots.length;
      stats.bytes += bytes;
      const unmarked = snapshots.filter((snapshot) => !snapshot.declared);
      const fallback = options.language || languageTag(root);
      const detectPage =
        !fallback && pageLanguage === undefined && unmarked.length > 0;
      const detected = await detectLanguages([
        ...(detectPage
          ? [
              languageSample(
                unmarked.map(({ text }) => languageSample(text)).join("\n"),
              ),
            ]
          : []),
        ...unmarked.map(({ text }) => text),
      ]);
      if (!current()) return;
      if (detectPage) pageLanguage = detected.shift() ?? null;
      stats.detectionMs += performance.now() - detectionStarted;

      const preferences = getSettings();
      const groups = new Map<string, Map<string, Element[]>>();
      function paint(element: Element, text: string, result: ScanResult) {
        if (!element.isConnected || queued.has(element)) return;
        const snapshot = readBlock(element);
        if (snapshot.text !== text) {
          queueBlock(element);
          return;
        }
        const paintStarted = performance.now();
        render(element, text, snapshot.parts, result, version);
        stats.highlightMs += performance.now() - paintStarted;
        if (
          firstVisible &&
          visible.has(element) &&
          result.spans.length &&
          getSettings().wordColorsEnabled
        ) {
          firstVisible = false;
          stats.firstVisibleSinceNavigationMs = Math.round(performance.now());
        }
      }
      for (const { element, text, declared } of snapshots) {
        const language = readingLanguage(
          declared ||
            (!declared ? detected.shift() : null) ||
            fallback ||
            pageLanguage,
        );
        if (!element.isConnected || queued.has(element)) continue;
        if (!language || !preferences.studyLanguages.includes(language)) {
          deleteBlock(element);
          continue;
        }
        if (prioritize) firstVisibleBatch = false;
        const key = scanKey(language, text);
        const hit = parsed.get(key);
        if (hit && (!hit.retryAt || hit.retryAt > Date.now())) {
          stats.readerCacheHits++;
          paint(element, text, hit);
          continue;
        }
        if (
          blocks.get(element)?.text !== text ||
          blocks.get(element)?.language !== language
        )
          paint(element, text, { language, spans: [] });
        if (
          queued.has(element) ||
          preferences.wordLoading[language] === "onLookup"
        )
          continue;
        parsed.delete(key);
        const texts = groups.get(language) ?? new Map<string, Element[]>();
        const elements = texts.get(text) ?? [];
        elements.push(element);
        texts.set(text, elements);
        groups.set(language, texts);
      }

      const dispatchStarted = performance.now();
      const highlightsBeforeDispatch = stats.highlightMs;
      await Promise.all(
        [...groups].map(async ([language, texts]) => {
          try {
            const missing = [...texts.keys()];
            const { results, timing } = await readerClient({
              action: "scan",
              lookup: false,
              session,
              language,
              texts: missing,
            });
            if (!current()) return;
            if (timing)
              for (const [metric, value] of Object.entries(timing))
                stats.worker.set(
                  metric,
                  (stats.worker.get(metric) ?? 0) + value,
                );
            for (const [index, text] of missing.entries()) {
              const key = scanKey(language, text);
              const result = parsed.get(key) ?? results[index]!;
              parsed.set(key, result);
              for (const element of texts.get(text)!)
                paint(element, text, result);
            }
          } catch (error) {
            stats.failedGroups++;
            console.warn("SrsReader: scan request failed", { language, error });
          }
        }),
      );
      if (groups.size)
        stats.requestWallMs +=
          performance.now() -
          dispatchStarted -
          (stats.highlightMs - highlightsBeforeDispatch);
      if (current()) scheduleRetry();
    } catch (error) {
      stats.failedGroups++;
      console.warn("SrsReader: scan failed", error);
    } finally {
      if (current() && !queued.size) {
        const { started, worker, ...measurements } = stats;
        console.log("[SrsReader] Scan summary", {
          context: website ? "website" : "popup",
          wallMs: Math.round(performance.now() - started),
          ...Object.fromEntries(
            Object.entries(measurements).map(([name, value]) => [
              name,
              value === undefined ? null : Math.round(value),
            ]),
          ),
          workerTotals: Object.fromEntries(
            [...worker].map(([name, value]) => [name, Math.round(value)]),
          ),
        });
        profile = undefined;
      }
      scanning = false;
      schedule();
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
  function wordAtPointer(
    pointer: Pointer | undefined,
  ): LookupTarget | undefined {
    if (!isActive() || !pointer || !(pointer.target instanceof Element)) return;
    const target = pointer.target;
    if (!root.contains(target) || target.closest(excluded)) return;
    const caret = document.caretPositionFromPoint(
      pointer.clientX,
      pointer.clientY,
    );
    const node = caret?.offsetNode;
    const textNode = node?.nodeType === Node.TEXT_NODE ? node : undefined;
    if (textNode?.parentElement?.closest(excluded)) return;
    const element = (textNode?.parentElement || target).closest(blockSelector);
    const block =
      element &&
      lookupBlock(root.contains(element) ? element : root, textNode ?? target);
    if (!block) return;
    const part = block.parts.find((part) => part.node === textNode);
    const containsPointer = (range: Range | undefined) =>
      range &&
      [...range.getClientRects()].some(
        (rect) =>
          // Mouse coordinates can be rounded down while text rectangles are fractional.
          pointer.clientX >= Math.floor(rect.left) &&
          pointer.clientX <= rect.right &&
          pointer.clientY >= Math.floor(rect.top) &&
          pointer.clientY <= rect.bottom,
      );
    let offset = part && caret ? part.start + caret.offset : undefined;
    // A caret can snap past the character the pointer is still over.
    if (
      offset !== undefined &&
      offset > 0 &&
      containsPointer(makeRange(block.parts, offset - 1, offset))
    )
      offset--;
    let span:
      | Pick<
          ScanSpan,
          "start" | "end" | "term" | "occurrence" | "related" | "compoundPart"
        >
      | undefined;
    let hitRange: Range | undefined;
    if (offset !== undefined) {
      const position = offset;
      span = block.spans.find(
        (span) => position >= span.start && position < span.end,
      );
      if (span) {
        const range = makeRange(block.parts, span.start, span.end);
        if (containsPointer(range)) hitRange = range;
        else span = undefined;
      }
      const numeric = numeralAt(block.text, position, block.language);
      if (
        numeric &&
        !(
          span &&
          span.start <= numeric.start &&
          span.end >= numeric.end &&
          (span.start < numeric.start || span.end > numeric.end)
        )
      ) {
        const range = makeRange(block.parts, numeric.start, numeric.end);
        if (containsPointer(range)) {
          const term = block.text.slice(numeric.start, numeric.end);
          const exact =
            span?.start === numeric.start &&
            span.end === numeric.end &&
            span.term === term;
          span = {
            ...numeric,
            term,
            occurrence: exact ? span?.occurrence : undefined,
          };
          hitRange = range;
        }
      }
    }
    // The caret can land outside a phrase or marked compound at its edge.
    span ??= block.spans.find(
      (span) =>
        (/\s/u.test(span.term) ||
          (block.language === "de" && /[-‐‑]/u.test(span.term))) &&
        containsPointer(makeRange(block.parts, span.start, span.end)),
    );
    if (!span && block.language === "de") {
      for (const { 0: written, index: start } of germanInitialAbbreviations(
        block.text,
      )) {
        const end = start + written.length;
        if (containsPointer(makeRange(block.parts, start, end))) {
          span = { start, end, term: spacedGermanAbbreviation(written) };
          break;
        }
      }
    }
    if (!span && block.language === "de" && /[-‐‑]/u.test(block.text)) {
      for (const { 0: term, index: start } of germanHyphenatedCompounds(
        block.text,
      )) {
        if (
          hasGermanSuspensionHyphen(term) &&
          !getSettings().splitGermanCompounds
        )
          continue;
        const end = start + term.length;
        if (containsPointer(makeRange(block.parts, start, end))) {
          span = { start, end, term };
          break;
        }
      }
    }
    let requirePhrase = false;
    if (!span) {
      const segments = new Intl.Segmenter(block.language, {
        granularity: "word",
      }).segment(block.text);
      const segment =
        offset === undefined ? undefined : segments.containing(offset);
      if (
        segment?.isWordLike &&
        containsPointer(
          makeRange(
            block.parts,
            segment.index,
            segment.index + segment.segment.length,
          ),
        )
      )
        span = {
          start: segment.index,
          end: segment.index + segment.segment.length,
          term: segment.segment,
        };
      if (!span && getSettings().wordLoading[block.language] === "onLookup") {
        for (const gap of block.text.matchAll(/[^\S\r\n]+/gu)) {
          const start = gap.index;
          const end = start + gap[0].length;
          if (!containsPointer(makeRange(block.parts, start, end))) continue;
          if (
            segments.containing(start - 1)?.isWordLike &&
            segments.containing(end)?.isWordLike
          ) {
            span = { start, end, term: "" };
            requirePhrase = true;
          }
          break;
        }
      }
    }
    if (!span) return;
    if (block.language === "cs" && !span.occurrence && !requirePhrase) {
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
        hitRange = undefined;
      }
    }
    const range = hitRange ?? makeRange(block.parts, span.start, span.end);
    if (!range || (!hitRange && !containsPointer(range))) return;
    const context = contextFor(block, span);
    return {
      term: span.term,
      range,
      context,
      pointerIndex: offset === undefined ? undefined : offset - span.start,
      requirePhrase,
      compound: originalCompound(context, span.compoundPart),
      occurrence: span.occurrence,
      focusRanges: span.related?.flatMap(({ start, end }) => {
        const range = makeRange(block.parts, start, end);
        return range ? [range] : [];
      }),
    };
  }
  function selectedWord(): LookupTarget | undefined {
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
      term: span?.term ?? term,
      range,
      context,
      compound: originalCompound(context, span?.compoundPart),
      occurrence: span?.occurrence,
      focusRanges: span?.related?.flatMap(({ start, end }) => {
        const range = makeRange(block!.parts, start, end);
        return range ? [range] : [];
      }),
    };
  }
  async function prepareLookup(
    word: LookupTarget,
  ): Promise<LookupTarget | undefined> {
    const { context, range } = word;
    const fallback = word.requirePhrase ? undefined : word;
    const languages = getSettings().studyLanguages;
    if (
      !options.language &&
      (!context.language || !languages.includes(context.language))
    ) {
      if (word.requirePhrase) return;
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
      const language = languages[index < 0 ? 0 : index]!;
      return {
        ...word,
        context: {
          ...context,
          language,
        },
        occurrence: undefined,
        refineContext:
          !word.compound && getSettings().wordLoading[language] !== "onLookup",
      };
    }
    if (!context.language || word.occurrence || word.compound) return fallback;
    const parent = range.startContainer.parentElement?.closest(blockSelector);
    const element = parent && root.contains(parent) ? parent : root;
    const key = scanKey(context.language, context.sentence);
    let ready = parsed.get(key);
    if (
      getSettings().wordLoading[context.language] !== "onLookup" &&
      !(context.language === "de" && getSettings().splitGermanCompounds)
    ) {
      const block = blocks.get(element);
      const scanned =
        ready ??
        (block && !queued.has(element)
          ? parsed.get(scanKey(context.language, block.text))
          : undefined);
      return fallback && { ...fallback, refineContext: !scanned };
    }
    const block = lookupBlock(
      element,
      range.startContainer,
      range.endContainer,
    );
    const first = block?.parts.find(
      (part) => part.node === range.startContainer,
    );
    if (!block || !first) return fallback;
    const offset = first.start + range.startOffset - context.start;
    if (!ready && !queued.has(element)) {
      const scanned = parsed.get(scanKey(context.language, block.text));
      if (scanned)
        ready = {
          ...scanned,
          spans: scanned.spans
            .filter(
              (span) =>
                span.start >= offset &&
                span.end <= offset + context.sentence.length,
            )
            .map((span) => ({
              ...span,
              start: span.start - offset,
              end: span.end - offset,
              related: span.related?.map(({ start, end }) => ({
                start: start - offset,
                end: end - offset,
              })),
            })),
        };
    }
    if (blocks.get(element) !== block)
      render(element, block.text, block.parts, block, generation);
    const id = session;
    if (ready?.retryAt && ready.retryAt <= Date.now()) {
      parsed.delete(key);
      ready = undefined;
    }
    if (ready) applyScanResult(id, context.sentence, ready, element);
    else {
      const {
        results: [result],
      } = await readerClient({
        action: "scan",
        lookup: true,
        session: id,
        language: context.language,
        texts: [context.sentence],
      });
      if (session !== id || readBlock(element).text !== block.text)
        return fallback;
      ready = parsed.get(key) ?? result!;
      applyScanResult(id, context.sentence, ready);
    }
    const pointerIndex = word.pointerIndex;
    if (parseNumeral(word.term, context.language)) {
      const exact = ready.spans.find(
        (span) =>
          span.start === context.start &&
          span.end === context.end &&
          span.term === word.term &&
          context.surface === word.term,
      );
      return fallback && { ...fallback, occurrence: exact?.occurrence };
    }
    const span =
      (pointerIndex === undefined
        ? undefined
        : ready.spans.find(
            (span) =>
              span.compoundPart &&
              span.start >= context.start &&
              span.end <= context.end &&
              span.start <= context.start + pointerIndex &&
              span.end > context.start + pointerIndex,
          )) ||
      ready.spans.find(
        (span) =>
          span.start <= context.start &&
          span.end >= context.end &&
          (!word.requirePhrase ||
            (span.ids.length > 0 &&
              span.start < context.start &&
              span.end > context.end)),
      ) ||
      ready.spans.find(
        (span) =>
          span.start === context.start &&
          span.related?.some(({ end }) => end === context.end),
      );
    if (!span) return fallback;
    const nextContext = {
      ...context,
      surface: context.sentence.slice(span.start, span.end),
      start: span.start,
      end: span.end,
    };
    return {
      term: span.term,
      range:
        makeRange(block.parts, offset + span.start, offset + span.end) || range,
      context: nextContext,
      compound: originalCompound(nextContext, span.compoundPart),
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
    scanScheduler.cancel();
    clearTimeout(retryTimer);
    queuedAt = undefined;
    profile = undefined;
    parsed.clear();
    viewport?.disconnect();
    viewport = undefined;
    observed.clear();
    visible.clear();
    textVisibility.clear();
    starting = website;
    firstVisibleBatch = true;
    firstVisible = true;
    queued.clear();
    wordStates.clear();
    for (const element of blocks.keys()) deleteBlock(element);
  }
  function reset() {
    clear();
    if (!isActive() || (options.onLookup && !getSettings().scanPopups)) return;
    if (website) {
      const version = generation;
      viewport = new IntersectionObserver((entries) => {
        if (version !== generation) return;
        let scanVisible = false;
        for (const entry of entries)
          if (entry.isIntersecting) {
            visible.add(entry.target);
            if (!blocks.has(entry.target)) queueBlock(entry.target);
            scanVisible ||= queued.has(entry.target);
          } else visible.delete(entry.target);
        if (starting || scanVisible) {
          starting = false;
          schedule();
        }
      });
    }
    observer = new MutationObserver((records) => {
      const candidates = new Set<Element>();
      const subtrees = new Set<Element>();
      const visibilitySubtrees = new Set<Element>();
      const rebuildRanges = new Set<Element>();
      let removed = false;
      for (const record of records) {
        const element =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        if (element?.closest("[data-srs-reader]")) continue;
        if (element && record.type === "attributes") {
          if (
            record.attributeName === "class" ||
            record.attributeName === "style" ||
            record.attributeName === "open"
          ) {
            visibilitySubtrees.add(element);
            continue;
          }
          for (const block of blocks.keys())
            if (element === block || element.contains(block)) {
              if (
                record.attributeName === "lang" ||
                record.attributeName === "data-reading-language"
              )
                queued.add(block);
              else candidates.add(block);
            }
          subtrees.add(element);
          continue;
        }
        if (element) {
          const block = element.closest(blockSelector);
          if (block && (blocks.has(block) || record.type === "characterData")) {
            if (record.type === "characterData")
              trackVisibility(element, block);
            candidates.add(block);
            if (record.type === "characterData") rebuildRanges.add(block);
          }
        }
        for (const added of record.addedNodes)
          if (added instanceof Element) subtrees.add(added);
          else {
            const parent = added.parentElement;
            const block = parent?.closest(blockSelector);
            if (parent && block) {
              trackVisibility(parent, block);
              candidates.add(block);
            }
          }
        removed ||= record.removedNodes.length > 0;
      }
      for (const element of subtrees) collectBlocks(element, candidates);
      for (const element of visibilitySubtrees) {
        let ancestor = element.parentElement;
        while (ancestor && !visibilitySubtrees.has(ancestor))
          ancestor = ancestor.parentElement;
        if (ancestor) continue;
        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_ELEMENT,
          {
            acceptNode: (node) =>
              (node as Element).hasAttribute("data-srs-reader")
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT,
          },
        );
        let parent: Element | null = element;
        do {
          const previous = textVisibility.get(parent);
          if (!previous) continue;
          const visible =
            !parent.matches("details:not([open])") &&
            parent.checkVisibility({ checkVisibilityCSS: true });
          if (visible === previous.visible) continue;
          previous.visible = visible;
          candidates.add(previous.block);
        } while ((parent = walker.nextNode() as Element | null));
      }
      for (const block of candidates)
        if (root.contains(block)) queueBlock(block, rebuildRanges.has(block));
      if (queued.size) schedule();
      if (removed) {
        for (const element of textVisibility.keys())
          if (!root.contains(element)) textVisibility.delete(element);
        for (const element of blocks.keys())
          if (!element.isConnected) deleteBlock(element);
        for (const element of observed)
          if (!element.isConnected) {
            viewport?.unobserve(element);
            observed.delete(element);
            visible.delete(element);
            queued.delete(element);
          }
      }
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
        "class",
        "style",
        "open",
      ],
    });
    if (root === document.body)
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["lang", "class", "style", "hidden", "aria-hidden"],
      });
    collect(root);
    if (!queued.size) starting = false;
  }
  function refreshTags() {
    for (const block of blocks.values())
      for (const span of block.spans) {
        highlights.get(span.state).delete(span.range);
        updateSpanState(span);
        highlights.get(span.state).add(span.range);
      }
  }
  function updateWord(id: string, snapshot: WordStateUpdate) {
    wordStates.set(id, snapshot);
    for (const result of parsed.values())
      for (const span of result.spans)
        if (span.ids.includes(id)) updateSpanState(span);
    for (const block of blocks.values())
      for (const span of block.spans) {
        if (!span.ids.includes(id)) continue;
        const previous = span.state;
        updateSpanState(span);
        if (span.state === previous) continue;
        highlights.get(previous).delete(span.range);
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
