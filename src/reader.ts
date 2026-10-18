import { browser } from "wxt/browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { rpc } from "./api";
import type { ScanSpan } from "./lookup";
import { matchesModifiers, readerKeysSchema } from "./controls";
import { installInputPrevention } from "./input-prevention";
import {
  defaults,
  type Settings,
  type ReadingContext,
  type WordState,
} from "./model";

type Part = { node: Text; start: number; end: number };
type Block = {
  text: string;
  parts: Part[];
  spans: ScanSpan[];
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
  const highlights = new Map<WordState, Highlight>();
  const queued = new Set<Element>();
  let settings: Settings = defaults;
  let active = false;
  const removeInputPrevention = options.onLookup
    ? () => {}
    : installInputPrevention(() => (active ? settings : undefined), "webpages");
  ctx.onInvalidated(removeInputPrevention);
  let scanning = false;
  let generation = 0;
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
  style.textContent = `::highlight(srs-unknown){background-color:#a78bfa30;color:inherit}::highlight(srs-learning){background-color:#60a5fa33;color:inherit}::highlight(srs-due){background-color:#fbbf2445;color:inherit}::highlight(srs-known){color:inherit}::highlight(srs-suspended){background-color:#94a3b826;color:inherit}::highlight(srs-focus){background-color:#a78bfaaa;color:inherit}`;
  document.documentElement.append(style);
  for (const state of [
    "unknown",
    "learning",
    "due",
    "known",
    "suspended",
  ] as const) {
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
  function collect(element: Element, immediate = false) {
    if (!active || element.closest(excluded)) return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    const targets = new Set<Element>();
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || !node.textContent?.trim() || parent.closest(excluded))
        continue;
      const block = parent.closest(blockSelector);
      if (block) targets.add(block);
    }
    for (const block of targets) {
      intersection?.observe(block);
      if (immediate) enqueue(block);
    }
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
            const adjusted = {
              ...span,
              start: span.start + offset,
              end: span.end + offset,
            };
            const range = makeRange(parts, adjusted.start, adjusted.end);
            if (!range) continue;
            block.spans.push(adjusted);
            block.ranges.push(range);
            highlights.get(span.state)!.add(range);
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
  function contextFor(block: Block, span: ScanSpan): ReadingContext {
    const segments = new Intl.Segmenter(settings.language, {
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
      url: options.source?.url || location.href,
      title: options.source?.title || document.title,
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
    popup.title = "SrsReader dictionary";
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
    const top =
      box.bottom + height + 12 <= innerHeight
        ? box.bottom + 4
        : Math.max(8, box.top - height - 4);
    Object.assign(popup.style, {
      width: `${width}px`,
      height: `${height}px`,
      left: `${Math.max(8, Math.min(box.left, innerWidth - width - 8))}px`,
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
    const span = block.spans.find(
      (span) => offset >= span.start && offset < span.end,
    );
    if (!span) return;
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
      range.startContainer.parentElement?.closest(excluded)
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
            term,
            ids: [],
            state: "unknown",
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
    settings = await rpc({ action: "settings" });
    if (ctx.isInvalid) return;
    style.textContent = `::highlight(srs-unknown){background-color:#a78bfa30;color:inherit}::highlight(srs-learning){background-color:#60a5fa33;color:inherit}::highlight(srs-due){background-color:#fbbf2445;color:inherit}::highlight(srs-known){color:inherit}::highlight(srs-suspended){background-color:#94a3b826;color:inherit}::highlight(srs-focus){background-color:#a78bfaaa;color:inherit}`;
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
    for (const element of blocks.keys()) deleteBlock(element);
    if (!next || !preservePopup) closePopup();
    active = next;
    if (!active) return;
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
  }) => {
    if (message.event === "closeLookup") closePopup();
    if (
      message.event === "resizeLookup" &&
      message.session === popupSession &&
      typeof message.height === "number"
    )
      sizePopup(message.height);
    if (message.event === "changed") {
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
