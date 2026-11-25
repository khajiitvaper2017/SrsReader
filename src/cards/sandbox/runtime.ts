import type { RuntimeConfig } from "@/cards/sandbox/protocol";

// Serialized into the opaque card frame. Keep this function self-contained.
export function cardRuntime(config: RuntimeConfig) {
  const send = (type: string, value: unknown) =>
    parent.postMessage({ channel: "srs-card-inner", type, value }, "*");
  for (const [name, kind] of [
    ["localStorage", "local"],
    ["sessionStorage", "session"],
  ] as const) {
    let values = new Map(Object.entries(config.storage[kind]));
    function change(
      operation: "set" | "remove" | "clear",
      key?: string,
      value?: string,
    ) {
      if (
        (key?.length || 0) > 1024 * 1024 ||
        (value?.length || 0) > 1024 * 1024
      ) {
        send("storageError", null);
        throw new DOMException("", "QuotaExceededError");
      }
      const next =
        operation === "clear" ? new Map<string, string>() : new Map(values);
      if (operation === "set") next.set(key!, value!);
      else if (operation === "remove") next.delete(key!);
      if (
        new TextEncoder().encode(JSON.stringify(Object.fromEntries(next)))
          .length >
        1024 * 1024
      ) {
        send("storageError", null);
        throw new DOMException("", "QuotaExceededError");
      }
      values = next;
      send("storage", { kind, operation, key, value });
    }
    const methods = {
      getItem: (key: string) => values.get(String(key)) ?? null,
      setItem: (key: string, value: string) =>
        change("set", String(key), String(value)),
      removeItem: (key: string) => change("remove", String(key)),
      clear: () => change("clear"),
      key: (index: number) => [...values.keys()][Number(index) >>> 0] ?? null,
    };
    const storage = new Proxy({} as Storage, {
      get: (target, property, receiver) => {
        if (property === "length") return values.size;
        if (property === Symbol.toStringTag) return "Storage";
        if (typeof property === "string" && Object.hasOwn(methods, property))
          return methods[property as keyof typeof methods];
        if (typeof property === "string" && values.has(property))
          return values.get(property);
        return Reflect.get(target, property, receiver);
      },
      set: (_target, property, value) => {
        if (typeof property !== "string") return false;
        change("set", property, String(value));
        return true;
      },
      deleteProperty: (_target, property) => {
        if (typeof property === "string") change("remove", property);
        return true;
      },
      ownKeys: () => [...values.keys()],
      getOwnPropertyDescriptor: (_target, property) =>
        typeof property === "string" && values.has(property)
          ? {
              configurable: true,
              enumerable: true,
              writable: true,
              value: values.get(property),
            }
          : undefined,
      has: (target, property) =>
        property === "length" ||
        (typeof property === "string" &&
          (Object.hasOwn(methods, property) || values.has(property))) ||
        Reflect.has(target, property),
    });
    Object.defineProperty(window, name, { configurable: true, value: storage });
  }
  const resolve = (value: string) => {
    if (value.startsWith("blob:")) return value.replace(/\?[^#]*/, "");
    const clean = value.replace(/^\.\//, "");
    let decoded = clean;
    try {
      decoded = decodeURIComponent(clean);
    } catch {
      /* A literal percent is valid in a media filename. */
    }
    const matched = [value, clean, decoded, decoded.split(/[?#]/)[0]!].find(
      (key) => Object.hasOwn(config.urls, key),
    );
    return matched === undefined
      ? value
      : config.urls[matched]! +
          (value.includes("#") && !matched.includes("#")
            ? `#${value.split("#").slice(1).join("#")}`
            : "");
  };
  const requests = new Map<
    string,
    { resolve: (url: string) => void; reject: (error: Error) => void }
  >();
  const requested = new Map<string, Promise<string>>();
  const prefix = `${Date.now()}:${Math.random()}:`;
  let nextRequest = 0;
  window.addEventListener("message", (event) => {
    if (
      event.source !== parent ||
      event.data?.channel !== "srs-card-asset-result"
    )
      return;
    const request = requests.get(event.data.requestId);
    if (!request) return;
    requests.delete(event.data.requestId);
    if (event.data.blob instanceof Blob)
      request.resolve(URL.createObjectURL(event.data.blob));
    else request.reject(new Error(event.data.error ?? ""));
  });
  const local = (value: string) =>
    value.length > 0 && !/^(?:[a-z][a-z0-9+.-]*:|[/#])/i.test(value);
  const needsAsset = (value: string) =>
    local(value) && resolve(value) === value;
  function requestAsset(value: string): Promise<string> {
    const known = resolve(value);
    if (!needsAsset(value)) return Promise.resolve(known);
    let result = requested.get(value);
    if (!result) {
      const requestId = prefix + nextRequest++;
      result = new Promise<string>((resolve, reject) => {
        requests.set(requestId, { resolve, reject });
        send("asset", { requestId, name: value });
      })
        .then((url) => {
          config.urls[value] = url;
          return url;
        })
        .catch((error: Error) => {
          if (error.message) send("error", error.message);
          throw error;
        });
      requested.set(value, result);
    }
    return result;
  }
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) =>
    originalFetch(
      typeof input === "string"
        ? await requestAsset(input)
        : input instanceof URL
          ? await requestAsset(input.href)
          : input,
      init,
    );

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalAbort = XMLHttpRequest.prototype.abort;
  type PendingXhr = { ready: Promise<void>; headers: [string, string][] };
  const xhrs = new WeakMap<XMLHttpRequest, PendingXhr>();
  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null,
  ) {
    xhrs.delete(this);
    const value = String(url);
    if (async && needsAsset(value)) {
      const entry: PendingXhr = { ready: Promise.resolve(), headers: [] };
      entry.ready = requestAsset(value).then((resolved) => {
        if (xhrs.get(this) !== entry) return;
        originalOpen.call(this, method, resolved, true, username, password);
        for (const [name, value] of entry.headers)
          originalHeader.call(this, name, value);
      });
      // The send handler reports failures through the ordinary XHR error event.
      void entry.ready.catch(() => {});
      xhrs.set(this, entry);
    } else
      originalOpen.call(
        this,
        method,
        resolve(value),
        async,
        username,
        password,
      );
  };
  XMLHttpRequest.prototype.setRequestHeader = function (
    name: string,
    value: string,
  ) {
    const entry = xhrs.get(this);
    if (entry) entry.headers.push([name, value]);
    else originalHeader.call(this, name, value);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const entry = xhrs.get(this);
    if (entry)
      void entry.ready
        .then(() => {
          if (xhrs.get(this) !== entry) return;
          xhrs.delete(this);
          originalSend.call(this, body);
        })
        .catch(() => this.dispatchEvent(new ProgressEvent("error")));
    else originalSend.call(this, body);
  };
  XMLHttpRequest.prototype.abort = function () {
    xhrs.delete(this);
    originalAbort.call(this);
  };
  const assignments = new WeakMap<Element, Map<string, string>>();
  function assign(
    element: Element,
    property: string,
    value: string,
    apply: (value: string) => void,
  ) {
    const pending = assignments.get(element) ?? new Map<string, string>();
    assignments.set(element, pending);
    pending.set(property, value);
    if (needsAsset(value))
      void requestAsset(value)
        .then((url) => {
          if (pending.get(property) === value) apply(url);
        })
        .catch(() => {});
    else apply(resolve(value));
  }
  for (const [prototype, property] of [
    [HTMLScriptElement.prototype, "src"],
    [HTMLImageElement.prototype, "src"],
    [HTMLMediaElement.prototype, "src"],
    [HTMLSourceElement.prototype, "src"],
    [HTMLVideoElement.prototype, "poster"],
    [HTMLLinkElement.prototype, "href"],
  ] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    if (descriptor?.set)
      Object.defineProperty(prototype, property, {
        ...descriptor,
        set(value: string) {
          assign(this, property, String(value), (url) =>
            descriptor.set!.call(this, url),
          );
        },
      });
  }
  const originalSet = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name: string, value: string) {
    if (["src", "href", "poster"].includes(name.toLowerCase()))
      assign(this, name.toLowerCase(), String(value), (url) =>
        originalSet.call(this, name, url),
      );
    else originalSet.call(this, name, value);
  };
  function resolveElement(element: Element) {
    for (const attribute of ["src", "href", "poster"]) {
      const value = element.getAttribute(attribute);
      if (value && local(value))
        assign(element, attribute, value, (url) =>
          originalSet.call(element, attribute, url),
        );
    }
    const style = element.getAttribute("style");
    if (style)
      for (const match of style.matchAll(
        /url\(\s*["']?([^"')]+)["']?\s*\)/gi,
      )) {
        const value = match[1]!;
        if (local(value))
          void requestAsset(value)
            .then((url) => {
              const current = element.getAttribute("style");
              if (current?.includes(value))
                originalSet.call(
                  element,
                  "style",
                  current.replaceAll(value, url),
                );
            })
            .catch(() => {});
      }
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes")
        resolveElement(mutation.target as Element);
      for (const node of mutation.addedNodes)
        if (node instanceof Element) {
          resolveElement(node);
          node
            .querySelectorAll("[src],[href],[poster],[style]")
            .forEach(resolveElement);
        }
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["src", "href", "poster", "style"],
  });
  window.addEventListener(
    "error",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const value =
        target.getAttribute("src") ||
        target.getAttribute("href") ||
        target.getAttribute("poster");
      if (!value) return;
      if (needsAsset(value)) void requestAsset(value).catch(() => {});
      else send("error", `${config.resourceError} ${value}`);
    },
    true,
  );
  const NativeFontFace = window.FontFace;
  window.FontFace = class extends NativeFontFace {
    constructor(
      family: string,
      source: string | BufferSource,
      descriptors?: FontFaceDescriptors,
    ) {
      super(
        family,
        typeof source === "string"
          ? source.replace(
              /url\(\s*(["']?)(.*?)\1\s*\)/gi,
              (_all, _quote: string, url: string) =>
                `url("${resolve(url).replaceAll('"', "%22")}")`,
            )
          : source,
        descriptors,
      );
    }
  };
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    send("audioStarted", null);
    document
      .querySelectorAll<HTMLMediaElement>("audio,video")
      .forEach((other) => {
        if (other !== this && !other.muted) other.pause();
      });
    return originalPlay.call(this);
  };
  window.addEventListener("message", (event) => {
    if (
      event.source !== parent ||
      event.data?.channel !== "srs-card-control" ||
      event.data.type !== "stop"
    )
      return;
    document
      .querySelectorAll<HTMLMediaElement>("audio,video")
      .forEach((media) => media.pause());
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  });
  function height() {
    send(
      "height",
      Math.ceil(
        Math.max(
          document.body.getBoundingClientRect().height,
          document.body.scrollHeight,
        ),
      ),
    );
  }
  function lookup(event: MouseEvent) {
    if (
      !config.scan ||
      !event.isTrusted ||
      (event.target as Element).closest(
        "input,textarea,button,a,summary,[contenteditable]",
      )
    )
      return;
    const selection = window.getSelection()?.toString().trim();
    if (selection)
      send("lookup", {
        text: selection.slice(0, 256),
        x: event.clientX,
        y: event.clientY,
      });
  }
  function ready() {
    const mobile = matchMedia("(max-width:36em)");
    const applyMobile = () =>
      document.body.classList.toggle("mobile", mobile.matches);
    applyMobile();
    mobile.addEventListener("change", applyMobile);
    new ResizeObserver(height).observe(document.body);
    height();
    document
      .querySelectorAll<HTMLInputElement>("[data-srs-type]")
      .forEach((input) => {
        input.value = config.answers[input.dataset.srsType!] || "";
        input.addEventListener("input", () =>
          send("answer", { name: input.dataset.srsType, value: input.value }),
        );
      });
    document
      .querySelectorAll<HTMLElement>("[data-srs-type-answer]")
      .forEach((element) => {
        const expected = element.dataset.expected || "";
        const answer = config.answers[element.dataset.srsTypeAnswer!] || "";
        const entered = document.createElement("span");
        entered.textContent = answer;
        entered.className =
          answer.normalize("NFC").trim() === expected.normalize("NFC").trim()
            ? "typeGood"
            : "typeBad";
        element.append(entered);
        if (
          answer.normalize("NFC").trim() !== expected.normalize("NFC").trim()
        ) {
          const correct = document.createElement("span");
          correct.className = "typeGood";
          correct.textContent = ` → ${expected}`;
          element.append(correct);
        }
      });
    document.querySelectorAll<HTMLElement>("[data-srs-tts]").forEach((button) =>
      button.addEventListener("click", () => {
        send("audioStarted", null);
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(
          button.dataset.srsTts || "",
        );
        utterance.lang = button.dataset.lang || config.language;
        speechSynthesis.speak(utterance);
      }),
    );
    const selectionLimit = config.selectionLimit;
    if (selectionLimit) {
      let selectionTimer: ReturnType<typeof setTimeout> | undefined;
      const reportSelection = () => {
        const selection = window.getSelection();
        const text = selection?.toString().trim() || "";
        const rect =
          text && selection?.rangeCount
            ? selection.getRangeAt(0).getBoundingClientRect()
            : undefined;
        send(
          "selection",
          rect
            ? {
                text: text.slice(0, selectionLimit + 1),
                x: (rect.left + rect.right) / 2,
                y: rect.bottom,
              }
            : null,
        );
        return !!rect;
      };
      document.addEventListener("selectionchange", () => {
        clearTimeout(selectionTimer);
        selectionTimer = setTimeout(reportSelection, 140);
      });
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        clearTimeout(selectionTimer);
        send("selection", null);
      });
      document.addEventListener("contextmenu", (event) => {
        if (!event.isTrusted || event.defaultPrevented) return;
        if (reportSelection()) {
          clearTimeout(selectionTimer);
          event.preventDefault();
        }
      });
    } else document.addEventListener("dblclick", lookup);
    document.addEventListener("click", (event) => {
      const target = (event.target as Element).closest<HTMLElement>(
        "[data-srs-sound]",
      );
      if (target) {
        if (
          !event.isTrusted &&
          !navigator.userActivation?.isActive &&
          !config.autoplay
        )
          return;
        const audio = document.getElementById(
          target.dataset.srsSound!,
        ) as HTMLMediaElement | null;
        if (audio) {
          audio.currentTime = 0;
          void audio.play().catch((error: Error) => {
            if (error.name !== "NotAllowedError") send("error", error.message);
          });
        }
      }
      if (event.ctrlKey || event.altKey) lookup(event);
    });
    if (config.autoplay) {
      const audio = document.querySelector<HTMLMediaElement>(
        "audio[data-srs-audio],video[data-srs-audio]",
      );
      const tts = document.querySelector<HTMLElement>("[data-srs-tts]");
      if (audio) void audio.play().catch(() => send("autoplayFallback", null));
      else if (tts) tts.click();
      else send("autoplayFallback", null);
    }
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", ready, { once: true });
  else ready();
  const rendered = async () => {
    await document.fonts.ready;
    height();
    send("rendered", null);
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => void rendered(), {
      once: true,
    });
  else void rendered();
}
