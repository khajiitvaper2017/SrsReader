import type { Part, ReaderConfiguration as Settings } from "@/reader/types";
import { languageTag } from "@/languages/detection";

export const blockSelector =
  "p,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,pre,figcaption,div,section,article,main,body";
export const excludedSelector =
  'script,style,noscript,textarea,input,select,button,nav,[role="menu"],[role="menubar"],[role="toolbar"],[role="navigation"],[role="button"],[role="slider"],[role="progressbar"],[role="scrollbar"],code,[contenteditable]:not([contenteditable="false"]),[aria-hidden="true"],[data-srs-reader],sup[rel~="dc:references"],sup[id^="cite_ref-"]';
export function makeRange(parts: Part[], start: number, end: number) {
  const first = parts.find((p) => start >= p.start && start < p.end);
  const last = parts.find((p) => end > p.start && end <= p.end);
  if (!first || !last || !first.node.isConnected || !last.node.isConnected)
    return;
  const range = new Range();
  range.setStart(first.node, start - first.start);
  range.setEnd(last.node, end - last.start);
  return range;
}
export function createBlockReader(
  root: HTMLElement,
  excluded: string,
  getSettings: () => Settings,
) {
  function matchesLanguage(element: Element) {
    const marked = element.closest("[lang],[data-reading-language]");
    if (!marked || !root.contains(marked)) return true;
    const language = languageTag(marked);
    return !language || getSettings().studyLanguages.includes(language);
  }
  function readBlock(
    element: Element,
    includeOtherLanguages = false,
  ): { text: string; parts: Part[] } {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    );
    let node: Node | null;
    let text = "";
    const parts: Part[] = [];
    const layoutContainers = new WeakMap<Element, Element>();
    function layoutContainer(parent: Element): Element {
      const cached = layoutContainers.get(parent);
      if (cached) return cached;
      const container =
        parent === element ||
        !["inline", "contents"].includes(getComputedStyle(parent).display)
          ? parent
          : layoutContainer(parent.parentElement!);
      layoutContainers.set(parent, container);
      return container;
    }
    let previousContainer: Element | undefined;
    while ((node = walker.nextNode())) {
      if (node instanceof Element) {
        if (node.tagName === "BR" && node.closest(blockSelector) === element)
          text += "\n";
        else if (
          node.matches(blockSelector) &&
          text &&
          !text.endsWith("\u2029")
        )
          text += "\u2029";
        continue;
      }
      const parent = node.parentElement;
      if (
        !parent ||
        parent.closest(excluded) ||
        (!includeOtherLanguages && !matchesLanguage(parent)) ||
        parent.closest(blockSelector) !== element
      )
        continue;
      const textNode = node as Text;
      if (
        parent.matches("details:not([open])") ||
        !parent.checkVisibility({ checkVisibilityCSS: true })
      )
        continue;
      const container = layoutContainer(parent);
      if (
        previousContainer &&
        container !== previousContainer &&
        text &&
        !text.endsWith("\u2029")
      )
        text += "\u2029";
      previousContainer = container;
      parts.push({
        node: textNode,
        start: text.length,
        end: text.length + textNode.length,
      });
      text += textNode.data;
    }
    return { text, parts };
  }
  return { matchesLanguage, readBlock };
}
