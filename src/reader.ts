import { t, setInterfaceLanguage } from "./i18n";
import { browser } from "wxt/browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { rpc } from "./api";
import type { ScanSpan } from "./lookup";
import { matchesModifiers, readerKeysSchema } from "./controls";
import { installInputPrevention } from "./input-prevention";
import { wordHighlightCss, wordStyleStates } from "./word-styles";
import { detectLanguage } from "./browser-ai";
import {
  defaults,
  folded,
  type Settings,
  type ReadingContext,
  type WordState,
} from "./model";

type Part = { node: Text; start: number; end: number };
type Block = {
  text: string;
  parts: Part[];
  spans: (ScanSpan & { range: Range })[];
  ranges: Range[];
  generation: number;
};
const blockSelector =
  "p,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,pre,figcaption,div,section,article,main,body";
const excludedSelector =
  'script,style,noscript,textarea,input,select,button,code,[contenteditable]:not([contenteditable="false"]),[aria-hidden="true"],[data-srs-reader]';

export function startReader(
  ctx: ContentScriptContext,
  options: {
    root?: HTMLElement;
    onLookup?: (term: string, context: ReadingContext) => void;
    source?: { url: string; title: string };
  } = {},
) {
  const root = options.root || document.body;
  const excluded =
    excludedSelector + (options.onLookup ? ",.meaning-label,.attribution" : "");
  const blocks = new Map<Element, Block>();
  const highlights = new Map<WordState | "ignored" | "unparsed", Highlight>();
  const queued = new Set<Element>();
  const wordStates = new Map<string, WordState>();
  let settings: Settings = defaults;
  let active = false;
  const removeInputPrevention = options.onLookup
    ? () => {}
    : installInputPrevention(() => (active ? settings : undefined), "webpages");
  ctx.onInvalidated(removeInputPrevention);
  let scanning = false;
  let generation = 0;
  let pageLanguage: Promise<string | null> = Promise.resolve(null);
  let pointer:
    | { clientX: number; clientY: number; target: EventTarget | null }
    | undefined;
  const heldKeys = new Set<string>();
  let modifiers = {
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  };
  const suppressedButtons = new Set<number>();
  let popup: HTMLIFrameElement | undefined;
  let popupRange: Range | undefined;
  let popupSession: string | undefined;
  let popupReady = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let observer: MutationObserver | undefined;
  let intersection: IntersectionObserver | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const style = document.createElement("style");
  style.dataset.srsReader = "";
  style.textContent = wordHighlightCss(settings);
  document.documentElement.append(style);
  for (const state of wordStyleStates) {
    const highlight = new Highlight();
    highlights.set(state, highlight);
    CSS.highlights.set(`srs-${state}`, highlight);
  }
  const focus = new Highlight();
  CSS.highlights.set("srs-focus", focus);
  function closePopup() {
    popup?.remove();
    popup = undefined;
    popupRange = undefined;
    popupSession = undefined;
    popupReady = false;
    focus.clear();
  }
  function relayKeys(event?: KeyboardEvent, pressed = false) {
    if (event)
      modifiers = {
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
      };
    const input = {
      type: "srs-reader-keys",
      session: options.onLookup
        ? new URLSearchParams(location.search).get("session")
        : popupSession,
      keys: [...heldKeys],
      code: event?.code || "",
      pressed,
      ...modifiers,
    };
    if (options.onLookup) window.parent.postMessage(input, "*");
    else
      popup?.contentWindow?.postMessage(
        input,
        new URL(browser.runtime.getURL("/")).origin,
      );
  }
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
      settings.ignoredTags.includes(tag),
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
    if (!active || element.closest(excluded)) return;
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
  function matchesLanguage(element: Element) {
    if (!options.onLookup) return true;
    const marked = element.closest("[lang],[data-reading-language]");
    if (!marked || !root.contains(marked)) return true;
    const language =
      marked.getAttribute("lang") ??
      marked.getAttribute("data-reading-language") ??
      "";
    return language.split("-")[0] === settings.studyLanguage;
  }
  function readBlock(element: Element): { text: string; parts: Part[] } {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    );
    let node: Node | null;
    let text = "";
    const parts: Part[] = [];
    while ((node = walker.nextNode())) {
      if (node instanceof Element) {
        if (node.tagName === "BR" && node.closest(blockSelector) === element)
          text += "\n";
        continue;
      }
      const parent = node.parentElement;
      if (
        !parent ||
        parent.closest(excluded) ||
        !matchesLanguage(parent) ||
        parent.closest(blockSelector) !== element
      )
        continue;
      const textNode = node as Text;
      if (!parent.checkVisibility({ checkVisibilityCSS: true })) continue;
      parts.push({
        node: textNode,
        start: text.length,
        end: text.length + textNode.length,
      });
      text += textNode.data;
    }
    return { text, parts };
  }
  function makeRange(parts: Part[], start: number, end: number) {
    const first = parts.find((p) => start >= p.start && start < p.end);
    const last = parts.find((p) => end > p.start && end <= p.end);
    if (!first || !last || !first.node.isConnected || !last.node.isConnected)
      return;
    const range = new Range();
    range.setStart(first.node, start - first.start);
    range.setEnd(last.node, end - last.start);
    return range;
  }
  async function drain() {
    if (scanning) return;
    scanning = true;
    try {
      while (queued.size && active) {
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
        if (!options.onLookup && settings.detectPageLanguage) {
          const detected = (await detectLanguage(text)) || (await pageLanguage);
          if (generation !== version || !active) continue;
          if (detected && detected !== settings.studyLanguage) continue;
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
          const spans = await rpc({
            action: "scan",
            text: text.slice(offset, end),
          });
          if (
            !active ||
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
            settings.wordColorsEnabled &&
            settings.wordStyles.unparsed.mode !== "none"
          ) {
            let matched = 0;
            for (const segment of new Intl.Segmenter(settings.studyLanguage, {
              granularity: "word",
            }).segment(text.slice(offset, end))) {
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
    const segments = new Intl.Segmenter(settings.studyLanguage, {
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
  async function show(term: string, range: Range, context: ReadingContext) {
    if (
      popupRange &&
      popupRange.compareBoundaryPoints(Range.START_TO_START, range) === 0
    )
      return;
    closePopup();
    if (options.onLookup) {
      options.onLookup(term, context);
      return;
    }
    popupRange = range;
    const session = await rpc({ action: "createSession", term, context });
    if (popupRange !== range || !range.startContainer.isConnected) return;
    popupSession = session;
    popup = document.createElement("iframe");
    popup.dataset.srsReader = "";
    popup.title = t("srsreader_dictionary");
    popup.allow = "translator; language-detector";
    popup.src =
      browser.runtime.getURL("/lookup.html") +
      `?session=${encodeURIComponent(session)}`;
    Object.assign(popup.style, {
      position: "fixed",
      border: "1px solid #8884",
      borderRadius: "8px",
      boxShadow: "0 5px 20px #0002",
      zIndex: "2147483647",
      colorScheme: settings.theme === "system" ? "light dark" : settings.theme,
      background: "Canvas",
    });
    sizePopup(180);
    document.documentElement.append(popup);
    focus.add(range);
  }
  function sizePopup(requestedHeight: number) {
    if (!popup || !popupRange) return;
    const box = popupRange.getBoundingClientRect();
    const width = Math.min(360, innerWidth - 16);
    const height = Math.max(
      1,
      Math.min(Math.max(140, requestedHeight), 460, innerHeight - 16),
    );
    const side =
      popup.dataset.srsReaderSide ||
      (settings.popupPlacement === "beside"
        ? box.right + width + 12 <= innerWidth
          ? "right"
          : "left"
        : settings.popupPlacement === "below" ||
            (settings.popupPlacement === "auto" &&
              box.bottom + 140 + 12 <= innerHeight)
          ? "below"
          : "above");
    popup.dataset.srsReaderSide = side;
    const left =
      side === "right"
        ? Math.min(innerWidth - width - 8, box.right + 4)
        : side === "left"
          ? Math.max(8, box.left - width - 4)
          : Math.max(8, Math.min(box.left, innerWidth - width - 8));
    const top =
      side === "below"
        ? Math.min(innerHeight - height - 8, box.bottom + 4)
        : side === "above"
          ? Math.max(
              8,
              Math.min(box.top - height - 4, innerHeight - height - 8),
            )
          : Math.max(8, Math.min(box.top, innerHeight - height - 8));
    Object.assign(popup.style, {
      width: `${width}px`,
      height: `${height}px`,
      left: `${left}px`,
      top: `${top}px`,
    });
  }
  function wordAtPointer() {
    if (!active || !pointer || (pointer.target as Element)?.closest(excluded))
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
        ...new Intl.Segmenter(settings.studyLanguage, {
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
    if (settings.studyLanguage === "cs") {
      const segments = [
        ...new Intl.Segmenter(settings.studyLanguage, {
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
      const previous = index > 0 ? segments[index - 1] : undefined;
      const currentIsSe = current && folded(current.segment, "cs") === "se";
      const adjacent = currentIsSe
        ? (next &&
            !block.text
              .slice(current.index + current.segment.length, next.index)
              .trim() &&
            next) ||
          (previous &&
            !block.text
              .slice(previous.index + previous.segment.length, current.index)
              .trim() &&
            previous)
        : (next &&
            folded(next.segment, "cs") === "se" &&
            !block.text
              .slice(current!.index + current!.segment.length, next.index)
              .trim() &&
            next) ||
          (previous &&
            folded(previous.segment, "cs") === "se" &&
            !block.text
              .slice(previous.index + previous.segment.length, current!.index)
              .trim() &&
            previous);
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
  function activate(useSelection = false) {
    if (!active) return false;
    const selected = selectedWord();
    const word =
      selected &&
      (useSelection ||
        (pointer &&
          [...selected.range.getClientRects()].some(
            (rect) =>
              pointer!.clientX >= rect.left &&
              pointer!.clientX <= rect.right &&
              pointer!.clientY >= rect.top &&
              pointer!.clientY <= rect.bottom,
          )))
        ? selected
        : wordAtPointer();
    if (!word) return false;
    clearTimeout(timer);
    void show(word.term, word.range, word.context).catch(console.warn);
    return true;
  }
  function hover(
    event: Pick<MouseEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">,
  ) {
    clearTimeout(timer);
    if (
      !settings.lookupBindings.some(
        (binding) =>
          binding.type === "hover" &&
          matchesModifiers(binding, event) &&
          (!binding.code || heldKeys.has(binding.code)),
      )
    )
      return;
    const word = wordAtPointer();
    if (word)
      timer = setTimeout(
        () =>
          void show(word.term, word.range, word.context).catch(console.warn),
        260,
      );
  }
  function consume(event: Event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  async function configure(preservePopup = false) {
    const previous = settings;
    settings = await rpc({ action: "settings" });
    await setInterfaceLanguage(
      settings.interfaceLanguage,
      settings.nativeLanguage,
    );
    if (ctx.isInvalid) return;
    style.textContent = wordHighlightCss(settings);
    const { ignoredTags: _oldTags, ...oldSettings } = previous;
    const { ignoredTags: _newTags, ...newSettings } = settings;
    if (
      preservePopup &&
      JSON.stringify(_oldTags) !== JSON.stringify(_newTags) &&
      JSON.stringify(oldSettings) === JSON.stringify(newSettings)
    ) {
      for (const block of blocks.values())
        for (const span of block.spans) {
          highlights.get(span.state)!.delete(span.range);
          updateSpanState(span);
          highlights.get(span.state)!.add(span.range);
        }
      return;
    }
    clearTimeout(timer);
    generation++;
    const next =
      settings.setupComplete &&
      !settings.paused &&
      (options.onLookup
        ? settings.scanPopups
        : !settings.disabledHosts.includes(location.hostname));
    observer?.disconnect();
    intersection?.disconnect();
    queued.clear();
    wordStates.clear();
    for (const element of blocks.keys()) deleteBlock(element);
    if (!next || !preservePopup) closePopup();
    active = next;
    if (!active) return;
    pageLanguage =
      !options.onLookup && settings.detectPageLanguage
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
  ctx.addEventListener(document, "mousemove", (event) => {
    pointer = {
      clientX: event.clientX,
      clientY: event.clientY,
      target: event.target,
    };
    hover(event);
  });
  ctx.addEventListener(window, "message", (event) => {
    const session = options.onLookup
      ? new URLSearchParams(location.search).get("session")
      : popupSession;
    if (
      event.source !== (options.onLookup ? window.parent : popup?.contentWindow)
    )
      return;
    if (
      !options.onLookup &&
      event.origin !== new URL(browser.runtime.getURL("/")).origin
    )
      return;
    if (
      !options.onLookup &&
      event.data?.type === "srs-reader-ready" &&
      event.data.session === session
    ) {
      popupReady = true;
      relayKeys();
    }
    const parsed = readerKeysSchema.safeParse(event.data);
    if (!parsed.success || parsed.data.session !== session) return;
    const input = parsed.data;
    const wasHeld = heldKeys.has(input.code);
    heldKeys.clear();
    for (const code of input.keys) heldKeys.add(code);
    modifiers = {
      ctrlKey: input.ctrlKey,
      altKey: input.altKey,
      shiftKey: input.shiftKey,
      metaKey: input.metaKey,
    };
    if (!options.onLookup || !active) return;
    if (
      input.pressed &&
      !wasHeld &&
      settings.lookupBindings.some(
        (binding) =>
          binding.type === "key" &&
          binding.code === input.code &&
          matchesModifiers(binding, input),
      )
    )
      activate(true);
    hover(input);
  });
  if (options.onLookup)
    window.parent.postMessage(
      {
        type: "srs-reader-ready",
        session: new URLSearchParams(location.search).get("session"),
      },
      "*",
    );
  ctx.addEventListener(
    document,
    "toggle",
    (event) => {
      if (event.target instanceof HTMLElement && root.contains(event.target))
        collect(event.target, true);
    },
    { capture: true },
  );
  ctx.addEventListener(
    document,
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        if (options.onLookup) return;
        if (popupReady) {
          relayKeys(event, true);
          consume(event);
          return;
        }
        clearTimeout(timer);
        closePopup();
        return;
      }
      if (!active || (event.target as Element)?.closest(excluded)) return;
      heldKeys.add(event.code);
      relayKeys(event, true);
      if (
        !event.repeat &&
        settings.lookupBindings.some(
          (binding) =>
            binding.type === "key" &&
            binding.code === event.code &&
            matchesModifiers(binding, event),
        ) &&
        activate(true)
      )
        consume(event);
      if (
        settings.lookupBindings.some(
          (binding) =>
            binding.type === "hover" &&
            binding.code === event.code &&
            matchesModifiers(binding, event),
        ) &&
        wordAtPointer()
      )
        consume(event);
      hover(event);
    },
    { capture: true },
  );
  ctx.addEventListener(
    document,
    "keyup",
    (event) => {
      heldKeys.delete(event.code);
      relayKeys(event);
      clearTimeout(timer);
    },
    { capture: true },
  );
  ctx.addEventListener(window, "blur", () => {
    if (popup && document.activeElement === popup) return;
    heldKeys.clear();
    modifiers = {
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    };
    relayKeys();
    suppressedButtons.clear();
    pointer = undefined;
    clearTimeout(timer);
  });
  ctx.addEventListener(
    document,
    "mousedown",
    (event) => {
      if (!root.contains(event.target as Node)) return;
      suppressedButtons.delete(event.button);
      if ((event.target as Element)?.closest("[data-srs-reader]")) return;
      pointer = {
        clientX: event.clientX,
        clientY: event.clientY,
        target: event.target,
      };
      if (
        !(event.target as Element)?.closest(excluded) &&
        settings.lookupBindings.some(
          (binding) =>
            binding.type === "mouse" &&
            binding.button === event.button &&
            matchesModifiers(binding, event),
        ) &&
        activate()
      ) {
        suppressedButtons.add(event.button);
        consume(event);
      } else closePopup();
    },
    { capture: true },
  );
  for (const eventName of [
    "mouseup",
    "auxclick",
    "click",
    "contextmenu",
  ] as const)
    ctx.addEventListener(
      document,
      eventName,
      (event) => {
        if (suppressedButtons.has(event.button)) consume(event);
      },
      { capture: true },
    );
  const onMessage = (message: {
    event?: string;
    session?: string;
    height?: number;
    word?: { id: string; state: WordState };
    language?: string;
    term?: string;
    candidates?: ScanSpan["candidates"];
  }) => {
    if (
      message.event === "parsed" &&
      active &&
      message.language === settings.studyLanguage &&
      message.term &&
      message.candidates?.length
    ) {
      applyParsedTerm(message.term, message.candidates);
      return;
    }
    if (message.event === "closeLookup") closePopup();
    if (
      message.event === "resizeLookup" &&
      message.session === popupSession &&
      typeof message.height === "number"
    )
      sizePopup(message.height);
    if (message.event === "changed") {
      if (message.word) {
        const { id, state } = message.word;
        wordStates.set(id, state);
        for (const block of blocks.values())
          for (const span of block.spans) {
            if (span.ids[0] !== id || span.state === state) continue;
            highlights.get(span.state)!.delete(span.range);
            updateSpanState(span);
            highlights.get(span.state)!.add(span.range);
          }
        return;
      }
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(
        () => void configure(true).catch(console.warn),
        180,
      );
    }
  };
  browser.runtime.onMessage.addListener(onMessage);
  void configure().catch(console.warn);
  ctx.onInvalidated(() => {
    active = false;
    clearTimeout(timer);
    clearTimeout(refreshTimer);
    observer?.disconnect();
    intersection?.disconnect();
    closePopup();
    style.remove();
    for (const state of highlights.keys())
      CSS.highlights.delete(`srs-${state}`);
    CSS.highlights.delete("srs-focus");
    browser.runtime.onMessage.removeListener(onMessage);
  });
}
