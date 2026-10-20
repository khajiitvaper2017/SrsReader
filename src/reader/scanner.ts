import type { ScanSpan } from "@/dictionaries/lookup";
import { detectLanguage } from "@/languages/detection";
import { folded } from "@/languages/text";
import { blockSelector, createBlockReader, makeRange } from "@/reader/blocks";
import { readerClient } from "@/reader/client";
import type { ReaderHighlights } from "@/reader/highlights";
import type { Block, Pointer, ReaderOptions } from "@/reader/types";
import { type Settings } from "@/settings/model";
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
  const wordStates = new Map<string, WordState>();
  const { matchesLanguage, readBlock } = createBlockReader(
    root,
    excluded,
    options,
    getSettings,
  );
  let scanning = false;
  let generation = 0;
  let pageLanguage: Promise<string | null> = Promise.resolve(null);
  let observer: MutationObserver | undefined;
  let intersection: IntersectionObserver | undefined;
  function deleteBlock(element: Element) {
    const old = blocks.get(element);
    if (!old) return;
    for (const range of old.ranges)
      for (const highlight of highlights.values()) highlight.delete(range);
    blocks.delete(element);
  }
  function updateSpanState(span: ScanSpan) {
    const candidate = span.candidates[0]!;
    span.state = candidate.tags.some((tag) =>
      getSettings().ignoredTags.includes(tag),
    )
      ? "ignored"
      : (wordStates.get(candidate.id) ?? candidate.state);
  }
  function applyParsedTerm(term: string, candidates: ScanSpan["candidates"]) {
    const escaped = term
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/gu, "\\s+");
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{M}\\p{N}_])${escaped}(?![\\p{L}\\p{M}\\p{N}_])`,
      "giu",
    );
    for (const block of blocks.values())
      for (const match of block.text.matchAll(pattern)) {
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
            for (const highlight of highlights.values()) highlight.delete(old);
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
  function collect(element: Element, immediate = false) {
    if (!isActive() || element.closest(excluded)) return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    const targets = new Set<Element>();
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
      if (block) targets.add(block);
    }
    for (const block of targets) {
      intersection?.observe(block);
      if (immediate) enqueue(block);
    }
  }
  async function drain() {
    if (scanning) return;
    scanning = true;
    try {
      while (queued.size && isActive()) {
        const element = queued.values().next().value!;
        queued.delete(element);
        if (!element.isConnected) {
          deleteBlock(element);
          continue;
        }
        const { text, parts } = readBlock(element);
        deleteBlock(element);
        if (!text.trim()) continue;
        const version = generation;
        if (!options.onLookup && getSettings().detectPageLanguage) {
          const detected = (await detectLanguage(text)) || (await pageLanguage);
          if (generation !== version || !isActive()) continue;
          if (detected && detected !== getSettings().studyLanguage) continue;
        }
        const block: Block = {
          text,
          parts,
          spans: [],
          ranges: [],
          generation: version,
        };
        blocks.set(element, block);
        for (let offset = 0; offset < text.length;) {
          let end = Math.min(offset + 12000, text.length);
          if (end < text.length) {
            const space = text.lastIndexOf(" ", end);
            if (space > offset) end = space;
          }
          const spans = await readerClient({
            action: "scan",
            text: text.slice(offset, end),
          });
          if (
            !isActive() ||
            generation !== version ||
            blocks.get(element) !== block ||
            readBlock(element).text !== text
          )
            break;
          for (const span of spans) {
            updateSpanState(span);
            const adjusted = {
              ...span,
              start: span.start + offset,
              end: span.end + offset,
            };
            if (
              block.spans.some(
                (span) =>
                  span.start === adjusted.start && span.end === adjusted.end,
              )
            )
              continue;
            const range = makeRange(parts, adjusted.start, adjusted.end);
            if (!range) continue;
            block.spans.push({ ...adjusted, range });
            block.ranges.push(range);
            highlights.get(adjusted.state)!.add(range);
          }
          if (
            getSettings().wordColorsEnabled &&
            getSettings().wordStyles.unparsed.mode !== "none"
          ) {
            let matched = 0;
            for (const segment of new Intl.Segmenter(
              getSettings().studyLanguage,
              {
                granularity: "word",
              },
            ).segment(text.slice(offset, end))) {
              if (!segment.isWordLike) continue;
              while (spans[matched] && spans[matched]!.end <= segment.index)
                matched++;
              if (spans[matched] && spans[matched]!.start <= segment.index)
                continue;
              if (
                block.spans.some(
                  (span) =>
                    span.start <= offset + segment.index &&
                    span.end > offset + segment.index,
                )
              )
                continue;
              const range = makeRange(
                parts,
                offset + segment.index,
                offset + segment.index + segment.segment.length,
              );
              if (range) {
                block.ranges.push(range);
                highlights.get("unparsed")!.add(range);
              }
            }
          }
          offset = end;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch (error) {
      console.warn("SrsReader:", error);
    } finally {
      scanning = false;
    }
  }
  function enqueue(element: Element) {
    queued.add(element);
    void drain();
  }
  function contextFor(
    block: Block,
    span: Pick<ScanSpan, "start" | "end">,
  ): ReadingContext {
    const source = block.parts[0]?.node.parentElement?.closest<HTMLElement>(
      "[data-reading-source-url]",
    );
    const segments = new Intl.Segmenter(getSettings().studyLanguage, {
      granularity: "sentence",
    }).segment(block.text);
    const segment = [...segments].find(
      (s) => span.start >= s.index && span.start < s.index + s.segment.length,
    );
    const start = segment?.index || 0;
    const sentence = segment?.segment || block.text;
    return {
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
    let span: Pick<ScanSpan, "start" | "end" | "term"> | undefined =
      block.spans.find((span) => offset >= span.start && offset < span.end);
    if (!span) {
      const segment = [
        ...new Intl.Segmenter(getSettings().studyLanguage, {
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
    if (getSettings().studyLanguage === "cs") {
      const segments = [
        ...new Intl.Segmenter(getSettings().studyLanguage, {
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
    return { term: span.term, range, context: contextFor(block, span) };
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
      !matchesLanguage(range.startContainer.parentElement!) ||
      !matchesLanguage(range.endContainer.parentElement!)
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
            sentence: term,
            surface: term,
            start: 0,
            end: term.length,
            url: options.source?.url || location.href,
            title: options.source?.title || document.title,
            mined: Date.now(),
          };
    return { term, range, context };
  }
  function clear() {
    generation++;
    observer?.disconnect();
    intersection?.disconnect();
    queued.clear();
    wordStates.clear();
    for (const element of blocks.keys()) deleteBlock(element);
  }
  function reset() {
    clear();
    if (!isActive()) return;
    pageLanguage =
      !options.onLookup && getSettings().detectPageLanguage
        ? detectLanguage(root.innerText)
        : Promise.resolve(null);
    intersection = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) enqueue(entry.target);
      },
      { rootMargin: "250px" },
    );
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
              deleteBlock(block);
              intersection?.unobserve(block);
            }
          collect(element);
          continue;
        }
        if (element) {
          const block = element.closest(blockSelector);
          if (block && blocks.has(block)) {
            deleteBlock(block);
            intersection?.unobserve(block);
            intersection?.observe(block);
          }
        }
        if (element && record.type === "characterData") collect(element);
        for (const added of record.addedNodes)
          if (added instanceof Element) collect(added);
          else if (added.parentElement) collect(added.parentElement);
      }
      for (const element of blocks.keys())
        if (!element.isConnected) {
          deleteBlock(element);
          intersection?.unobserve(element);
        }
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      ...(options.onLookup
        ? {
            attributes: true,
            attributeFilter: ["lang", "data-reading-language"],
          }
        : {}),
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
    dispose: clear,
  };
}
export type ReaderScanner = ReturnType<typeof createScanner>;
