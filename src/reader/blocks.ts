import type { Part, ReaderOptions } from "@/reader/types";
import { type Settings } from "@/settings/model";
export const blockSelector =
  "p,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,pre,figcaption,div,section,article,main,body";
export const excludedSelector =
  'script,style,noscript,textarea,input,select,button,code,[contenteditable]:not([contenteditable="false"]),[aria-hidden="true"],[data-srs-reader]';
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
  options: ReaderOptions,
  getSettings: () => Settings,
) {
  function matchesLanguage(element: Element) {
    if (!options.onLookup) return true;
    const marked = element.closest("[lang],[data-reading-language]");
    if (!marked || !root.contains(marked)) return true;
    const language =
      marked.getAttribute("lang") ??
      marked.getAttribute("data-reading-language") ??
      "";
    return language.split("-")[0] === getSettings().studyLanguage;
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
  return { matchesLanguage, readBlock };
}
