import type { CardFrameMessage, RuntimeConfig } from "@/cards/sandbox/protocol";
import type {
  installCardGestures,
  installCardInput,
} from "@/cards/sandbox/input";
import type { matchesReviewBinding } from "@/srs/controls";

// Blob URLs must be created inside the document that consumes them.
export function cardBootstrap(
  runtime: (config: RuntimeConfig) => void,
  installInput: typeof installCardInput,
  matchesBinding: typeof matchesReviewBinding,
  installGestures: typeof installCardGestures,
) {
  let urls: Record<string, string> = {};
  const send = (type: string, value: unknown) =>
    parent.postMessage({ channel: "srs-card-inner", type, value }, "*");
  const resolve = (value: string, source = urls) => {
    if (value.startsWith("blob:")) return value.replace(/\?[^#]*/, "");
    const name = value.replace(/^\.\//, "");
    let decoded = name;
    try {
      decoded = decodeURIComponent(name);
    } catch {
      /* Keep filenames with literal percent characters. */
    }
    const matched = [value, name, decoded, decoded.split(/[?#]/)[0]!].find(
      (key) => Object.hasOwn(source, key),
    );
    return matched === undefined
      ? value
      : source[matched]! +
          (value.includes("#") && !matched.includes("#")
            ? `#${value.split("#").slice(1).join("#")}`
            : "");
  };
  const rewriteCss = (css: string, source = urls) =>
    css
      .replace(
        /url\(\s*(["']?)(.*?)\1\s*\)/gi,
        (_, _quote: string, value: string) =>
          `url("${resolve(value, source).replaceAll('"', "%22")}")`,
      )
      .replace(
        /@import\s+(["'])(.*?)\1/gi,
        (_, quote: string, value: string) =>
          `@import ${quote}${resolve(value, source)}${quote}`,
      );

  async function render(
    data: CardFrameMessage & { answers: Record<string, string> },
    inputPort?: MessagePort,
  ) {
    const nextUrls = Object.fromEntries(
      data.assets.map((asset) => [asset.name, URL.createObjectURL(asset.blob)]),
    );
    const textAssets = new Map(
      data.assets
        .filter((asset) => /\.(?:css|js)$/i.test(asset.name))
        .map((asset) => [asset.name, asset]),
    );
    const processed = new Set<string>();
    const visiting = new Set<string>();
    async function rewriteAsset(name: string): Promise<void> {
      const asset = textAssets.get(name);
      if (!asset || processed.has(name) || visiting.has(name)) return;
      visiting.add(name);
      const original = await asset.blob.text();
      for (const match of original.matchAll(/["']([^"'\r\n]+)["']/g))
        if (textAssets.has(match[1]!)) await rewriteAsset(match[1]!);
      const content = /\.css$/i.test(asset.name)
        ? rewriteCss(original, nextUrls)
        : original.replace(
            /(["'])([^"'\r\n]+)\1/g,
            (whole, quote: string, value: string) =>
              resolve(value, nextUrls) === value
                ? whole
                : `${quote}${resolve(value, nextUrls)}${quote}`,
          );
      nextUrls[asset.name] = URL.createObjectURL(
        new Blob([content], {
          type:
            asset.mime ||
            (/\.css$/i.test(asset.name) ? "text/css" : "text/javascript"),
        }),
      );
      visiting.delete(name);
      processed.add(name);
    }
    for (const name of textAssets.keys()) await rewriteAsset(name);
    urls = nextUrls;
    let audioIndex = 0;
    const html = data.html.replace(/\[sound:([^\]]+)\]/g, (_, name: string) => {
      const id = `srs-audio-${audioIndex++}`;
      const tag = /\.(?:webm|mp4|mov|mkv)(?:[?#]|$)/i.test(name)
        ? "video"
        : "audio";
      const label = tag === "video" ? data.videoLabel : data.audioLabel;
      return `<button type="button" class="replay-button soundLink" data-srs-sound="${id}" aria-label="${label.replaceAll('"', "&quot;")}">▶</button><${tag} data-srs-audio id="${id}" src="${resolve(name).replaceAll('"', "%22")}"${tag === "video" ? " controls playsinline" : ""}></${tag}>`;
    });
    const parsed = new DOMParser().parseFromString(html, "text/html");
    parsed.querySelectorAll(".srs-meaning").forEach((element) => {
      element.classList.add("dictionary-content");
      element.toggleAttribute("data-hide-sources", data.hideSources);
    });
    parsed.querySelectorAll(".srs-attribution").forEach((element) => {
      if (/^https?:\/\//i.test(element.textContent?.trim() || ""))
        element.setAttribute("data-sc-content", "backlink");
    });
    parsed.querySelectorAll("[src],[href],[poster]").forEach((element) => {
      for (const attribute of ["src", "href", "poster"]) {
        const value = element.getAttribute(attribute);
        if (value) element.setAttribute(attribute, resolve(value));
      }
      if (
        element.tagName === "A" &&
        /^(?:https?:|blob:)/i.test(element.getAttribute("href") || "")
      ) {
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer");
      }
    });
    parsed
      .querySelectorAll("[style]")
      .forEach((element) =>
        element.setAttribute(
          "style",
          rewriteCss(element.getAttribute("style")!),
        ),
      );
    parsed.querySelectorAll("style").forEach((element) => {
      element.textContent = rewriteCss(element.textContent || "");
    });
    const config = JSON.stringify({
      urls,
      language: data.language,
      scan: data.scan,
      selectionLimit: data.selectionLimit,
      answers: data.answers,
      autoplay: data.autoplay,
      storage: data.storage,
      resourceError: data.resourceError,
    }).replace(/</g, "\\u003c");
    const sendInput = inputPort?.postMessage.bind(inputPort);
    document.open();
    if (sendInput) {
      installInput(data.reviewBindings, sendInput, matchesBinding);
      if (data.gesture) {
        let canSwipeUp = true;
        if (data.gesture === "front")
          window.addEventListener(
            "DOMContentLoaded",
            () => {
              // Keep scrolling available until the end of a long front is visible.
              const end = document.createElement("span");
              end.style.cssText =
                "display:block;width:1px;height:1px;pointer-events:none";
              end.setAttribute("aria-hidden", "true");
              document.body.append(end);
              new IntersectionObserver(([entry]) => {
                canSwipeUp = !!entry?.isIntersecting;
              }).observe(end);
            },
            { once: true },
          );
        installGestures(
          window,
          data.gesture,
          (gesture) => sendInput({ gesture }),
          () => canSwipeUp,
          data.scan,
        );
      }
    }
    document.write(
      `<!doctype html><html style="overflow:hidden" lang="${data.language.replace(/[^\w-]/g, "")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${data.theme}html,body{margin:0;min-width:0;overflow-wrap:anywhere}body{padding:12px;box-sizing:border-box;color:var(--mantine-color-text);background:var(--mantine-color-body)}img,video,audio{max-width:100%}.typeBad{text-decoration:line-through}.typeGood{font-weight:bold}.srs-hide-pos .srs-tags{display:none}</style><script>(${runtime.toString()})(${config});</script><style>${rewriteCss(data.css)}</style>${parsed.head.innerHTML}</head><body class="card card${data.ordinal + 1}${data.dark ? " nightMode night_mode" : ""}${data.hideSources ? " srs-hide-sources" : ""}${data.showPartOfSpeech ? "" : " srs-hide-pos"}">${parsed.body.innerHTML}</body></html>`,
    );
    document.close();
  }
  function receive(event: MessageEvent) {
    if (event.source !== parent || event.data?.channel !== "srs-card-render")
      return;
    window.removeEventListener("message", receive);
    void render(event.data, event.ports[0]).catch((error: Error) =>
      send("error", error.message),
    );
  }
  window.addEventListener("message", receive);
  send("ready", null);
}
