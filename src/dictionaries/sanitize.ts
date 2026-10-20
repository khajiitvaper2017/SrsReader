export function safeUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function scopedStyles(css: string, scope: string) {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css.replace(/@import[^;]*;/gi, ""));
    function rules(list: CSSRuleList): string {
      return [...list]
        .map((rule) => {
          if (rule instanceof CSSStyleRule) {
            const declarations = [...rule.style]
              .filter(
                (name) =>
                  !/position|z-index|content|animation|transition|behavior/i.test(
                    name,
                  ) &&
                  !/url\s*\(|expression|@import/i.test(
                    rule.style.getPropertyValue(name),
                  ),
              )
              .map((name) => `${name}:${rule.style.getPropertyValue(name)}`)
              .join(";");
            return `${rule.selectorText
              .split(",")
              .map((selector) => `${scope} ${selector.trim()}`)
              .join(",")}{${declarations}}`;
          }
          if (rule instanceof CSSMediaRule)
            return `@media ${rule.conditionText}{${rules(rule.cssRules)}}`;
          return "";
        })
        .join("\n");
    }
    return rules(sheet.cssRules);
  } catch {
    return "";
  }
}
