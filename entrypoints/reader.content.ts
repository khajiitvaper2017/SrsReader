import { defineContentScript } from "wxt/utils/define-content-script";
import { startReader } from "../src/reader";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  allFrames: true,
  runAt: "document_idle",
  main: (ctx) => startReader(ctx),
});
