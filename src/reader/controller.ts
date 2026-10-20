import type { RuntimeEvent } from "@/platform/messaging/events";
import { excludedSelector } from "@/reader/blocks";
import { createHighlights } from "@/reader/highlights";
import { installReaderInput } from "@/reader/input";
import { installInputPrevention } from "@/reader/input-prevention";
import { createPopup } from "@/reader/popup";
import { createScanner } from "@/reader/scanner";
import type { ReaderOptions } from "@/reader/types";
import { settingsClient } from "@/settings/client";
import { defaults, type Settings } from "@/settings/model";
import { setInterfaceLanguage } from "@/shared/i18n/i18n";
import { browser } from "wxt/browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";

export function startReader(
  ctx: ContentScriptContext,
  options: ReaderOptions = {},
) {
  const root = options.root || document.body;
  const excluded = excludedSelector;
  let settings: Settings = defaults;
  let active = false;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const highlights = createHighlights(settings);
  const popup = createPopup(options, () => settings, highlights);
  const scanner = createScanner(
    root,
    excluded,
    options,
    () => settings,
    () => active,
    highlights,
  );
  const input = installReaderInput(
    ctx,
    root,
    excluded,
    options,
    () => settings,
    () => active,
    popup,
    scanner,
  );
  const removeInputPrevention = options.onLookup
    ? () => {}
    : installInputPrevention(() => (active ? settings : undefined), "webpages");
  ctx.onInvalidated(removeInputPrevention);
  async function configure(preservePopup = false) {
    const started = performance.now();
    const previous = settings;
    settings = await settingsClient({ action: "settings" });
    const settingsMs = Math.round(performance.now() - started);
    await setInterfaceLanguage(
      settings.interfaceLanguage,
      settings.nativeLanguage,
    );
    if (ctx.isInvalid) return;
    highlights.configure(settings);
    const { ignoredTags: oldTags, ...oldSettings } = previous;
    const { ignoredTags: newTags, ...newSettings } = settings;
    if (
      preservePopup &&
      JSON.stringify(oldTags) !== JSON.stringify(newTags) &&
      JSON.stringify(oldSettings) === JSON.stringify(newSettings)
    ) {
      scanner.refreshTags();
      return;
    }
    input.cancel();
    active =
      settings.setupComplete &&
      !settings.paused &&
      (options.onLookup
        ? settings.scanPopups
        : !settings.disabledHosts.includes(location.hostname));
    console.info("[SrsReader] Reader configured", {
      context: options.onLookup ? "popup" : "page",
      active,
      studyLanguage: settings.studyLanguage,
      udpipeEnabled: settings.udpipe,
      detectPageLanguage: settings.detectPageLanguage,
      settingsMs,
      totalMs: Math.round(performance.now() - started),
    });
    if (!active || !preservePopup) popup.close();
    scanner.reset();
  }
  const onMessage = (message: RuntimeEvent) => {
    if (
      (message.event === "parsed" || message.event === "parsedOccurrence") &&
      active &&
      message.language === settings.studyLanguage &&
      message.candidates?.length
    ) {
      if (message.event === "parsedOccurrence")
        scanner.applyParsedOccurrence(message.occurrence, message.candidates);
      else if (message.term)
        scanner.applyParsedTerm(message.term, message.candidates);
      return;
    }
    if (message.event === "closeLookup") popup.close();
    if (message.event === "changed") {
      if (message.word) {
        scanner.updateWord(message.word.id, message.word.state);
        return;
      }
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(
        () => void configure(true).catch(console.warn),
        180,
      );
    }
  };
  browser.runtime.onMessage.addListener(onMessage);
  void configure().catch(console.warn);
  ctx.onInvalidated(() => {
    active = false;
    clearTimeout(refreshTimer);
    input.dispose();
    scanner.dispose();
    popup.close();
    highlights.dispose();
    browser.runtime.onMessage.removeListener(onMessage);
  });
}
