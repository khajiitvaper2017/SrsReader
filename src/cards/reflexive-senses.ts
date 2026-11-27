import { parseHTML } from "linkedom";

const reflexiveTag = /^(?:vr|refl\.?|reflexiv(?:e|es)?)(?:\s+verb)?$/iu;

/** Keep tagged glosses in structured dictionary lists when the card is reflexive. */
export function filterReflexiveSenses(html: string): string {
  if (!html.includes("glosses")) return html;
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  let changed = false;
  for (const list of document.querySelectorAll(
    'ol[data-sc-content="glosses"]',
  )) {
    const senses = [...list.children].filter(
      (element) => element.localName === "li",
    );
    const reflexive = new Set(
      senses.filter((sense) =>
        [
          ...sense.querySelectorAll(
            '[data-sc-content="tags"] [data-sc-content="tag"]',
          ),
        ].some(
          (tag) =>
            !tag.closest("details") &&
            [tag.textContent, tag.getAttribute("title")].some((label) =>
              reflexiveTag.test(label?.trim() ?? ""),
            ),
        ),
      ),
    );
    if (!reflexive.size || reflexive.size === senses.length) continue;
    for (const sense of senses) if (!reflexive.has(sense)) sense.remove();
    changed = true;
  }
  return changed ? document.body.innerHTML : html;
}
