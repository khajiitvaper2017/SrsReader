import type { CardFrameMessage } from "@/cards/sandbox/protocol";
import { cardBootstrap } from "@/cards/sandbox/render";
import { cardRuntime } from "@/cards/sandbox/runtime";
import { installCardInput } from "@/cards/sandbox/input";
import { matchesReviewBinding } from "@/srs/controls";

document.documentElement.style.cssText =
  "margin:0;padding:0;overflow:hidden;background:var(--mantine-color-body)";
document.body.style.cssText = "margin:0;padding:0;background:inherit";
const theme = document.createElement("style");
document.head.append(theme);
let frame: HTMLIFrameElement | undefined;
let displayed: HTMLIFrameElement | undefined;
let frameHeight = 80;
let current: CardFrameMessage | undefined;
let answers: Record<string, string> = {};
let answerNames = new Set<string>();
let inputPort: MessagePort | undefined;
let inputReceiver: MessagePort | undefined;
let removeInput: (() => void) | undefined;
const send = (type: string, value: unknown) =>
  parent.postMessage(
    {
      channel: "srs-card-frame",
      type,
      value,
      cardId: current?.cardId,
      renderId: current?.renderId,
    },
    "*",
  );

window.addEventListener("message", (event: MessageEvent) => {
  if (
    event.source === frame?.contentWindow &&
    event.data?.channel === "srs-card-inner"
  ) {
    const { type, value } = event.data;
    if (type === "ready" && current) {
      const port = inputPort;
      inputPort = undefined;
      frame!.contentWindow!.postMessage(
        { ...current, answers },
        "*",
        port ? [port] : [],
      );
    } else if (
      type === "answer" &&
      value &&
      answerNames.has(value.name) &&
      typeof value.value === "string"
    )
      answers[value.name] = value.value.slice(0, 30000);
    else if (
      type === "height" &&
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      frameHeight = Math.min(10000, Math.max(80, value));
      frame!.style.height = `${frameHeight}px`;
      if (frame === displayed) send("height", frameHeight);
    } else if (type === "rendered" && current) {
      if (displayed !== frame) displayed?.remove();
      displayed = frame;
      frame!.style.position = "";
      frame!.style.visibility = "visible";
      send("height", frameHeight);
      send("rendered", { cardId: current.cardId, renderId: current.renderId });
    } else if (["error", "audioStarted"].includes(type)) send(type, value);
    else if (type === "asset" && current && value && typeof value === "object")
      send("asset", { ...value, cardId: current.cardId });
    else if (type === "lookup" && current && value && typeof value === "object")
      send("lookup", { ...value, cardId: current.cardId });
    else if (
      type === "selection" &&
      frame === displayed &&
      current?.selectionLimit &&
      typeof value === "string"
    )
      send("selection", value.slice(0, current.selectionLimit + 1));
    else if (
      type === "storage" &&
      current &&
      value &&
      typeof value === "object"
    )
      send("storage", { ...value, cardId: current.cardId });
    else if (type === "storageError")
      send("storageError", { cardId: current?.cardId });
    return;
  }
  if (event.source !== parent) return;
  if (
    event.data?.channel === "srs-card-asset" &&
    current?.cardId === event.data.cardId
  ) {
    frame?.contentWindow?.postMessage(
      { ...event.data, channel: "srs-card-asset-result" },
      "*",
    );
    return;
  }
  if (event.data?.channel === "srs-card-stop") {
    frame?.contentWindow?.postMessage(
      { channel: "srs-card-control", type: "stop" },
      "*",
    );
    return;
  }
  if (event.data?.channel !== "srs-card-render") return;
  const data = event.data as CardFrameMessage;
  // The outer viewport keeps its old height until the host receives the resize.
  theme.textContent = data.theme;
  document.documentElement.style.colorScheme = data.dark ? "dark" : "light";
  if (frame !== displayed) frame?.remove();
  if (displayed) displayed.inert = true;
  frameHeight = 80;
  if (current?.cardId !== data.cardId) answers = {};
  current = data;
  const parsed = new DOMParser().parseFromString(data.html, "text/html");
  answerNames = new Set(
    [
      ...parsed.querySelectorAll<HTMLElement>(
        "[data-srs-type],[data-srs-type-answer]",
      ),
    ].map((input) => input.dataset.srsType || input.dataset.srsTypeAnswer!),
  );
  const next = document.createElement("iframe");
  inputReceiver?.close();
  inputPort?.close();
  const channel = new MessageChannel();
  inputReceiver = channel.port1;
  inputPort = channel.port2;
  inputReceiver.onmessage = (event) => {
    if (frame === next && current?.cardId === data.cardId)
      send("input", { ...event.data, cardId: data.cardId });
  };
  removeInput?.();
  removeInput = installCardInput(
    data.reviewBindings,
    (input) => send("input", { ...input, cardId: data.cardId }),
    matchesReviewBinding,
  );
  next.setAttribute(
    "sandbox",
    "allow-scripts allow-popups allow-popups-to-escape-sandbox",
  );
  next.style.cssText =
    "width:100%;height:1px;border:0;display:block;position:absolute;top:0;left:0;visibility:hidden";
  next.title = data.title;
  const bootstrap = cardBootstrap
    .toString()
    .replace(/<\/script/gi, "<\\/script");
  next.srcdoc = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>(${bootstrap})(${cardRuntime.toString()},${installCardInput.toString()},${matchesReviewBinding.toString()});</script></body></html>`;
  document.body.append(next);
  frame = next;
});
send("ready", null);
