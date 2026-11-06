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
    sheet.replaceSync(css);
    function rules(list: CSSRuleList): string {
      return [...list]
        .map((rule) => {
          const style = "style" in rule ? rule.style : undefined;
          if (
            (rule instanceof CSSStyleRule ||
              rule.constructor.name === "CSSNestedDeclarations") &&
            style instanceof CSSStyleDeclaration
          ) {
            for (const name of [...style]) {
              const value = style.getPropertyValue(name);
              if (
                /^(?:z-index|behavior|animation(?:-.+)?|transition(?:-.+)?)$/i.test(
                  name,
                ) ||
                (name === "position" &&
                  !["static", "relative", "absolute"].includes(value)) ||
                /url\s*\(|(?:-webkit-)?image-set\s*\(|expression|@import/i.test(
                  value,
                )
              )
                style.removeProperty(name);
            }
            if (!(rule instanceof CSSStyleRule)) return style.cssText;
            return `${rule.selectorText}{${style.cssText}${rules(rule.cssRules)}}`;
          }
          if (rule instanceof CSSMediaRule)
            return `@media ${rule.conditionText}{${rules(rule.cssRules)}}`;
          if (rule instanceof CSSSupportsRule)
            return `@supports ${rule.conditionText}{${rules(rule.cssRules)}}`;
          if (rule instanceof CSSContainerRule)
            return `@container ${rule.conditionText}{${rules(rule.cssRules)}}`;
          if (rule instanceof CSSLayerBlockRule)
            return `@layer ${rule.name}{${rules(rule.cssRules)}}`;
          return "";
        })
        .join("\n");
    }
    // Native nesting preserves selector lists; @scope also bounds sibling selectors.
    return `@scope (${scope}){:scope{${rules(sheet.cssRules)}}}`;
  } catch {
    return "";
  }
}
