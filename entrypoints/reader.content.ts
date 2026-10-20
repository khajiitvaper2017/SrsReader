import { startReader } from "@/reader/controller";
import { defineContentScript } from "wxt/utils/define-content-script";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  allFrames: true,
  runAt: "document_idle",
  main: (ctx) => startReader(ctx),
});
