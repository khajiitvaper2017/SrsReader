import type { RuntimeEvent } from "@/platform/messaging/events";
import { excludedSelector } from "@/reader/blocks";
import { createHighlights } from "@/reader/highlights";
import { installReaderInput } from "@/reader/input";
import { installInputPrevention } from "@/reader/input-prevention";
import { createPopup } from "@/reader/popup";
import { isWebsiteEnabled } from "@/reader/preferences";
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
  async function configure(preservePopup = false, refreshDictionaries = false) {
    const started = performance.now();
    const previous = settings;
    settings =
      !preservePopup && options.settings
        ? options.settings
        : await settingsClient({ action: "settings" });
    const settingsMs = Math.round(performance.now() - started);
    await setInterfaceLanguage(
      settings.interfaceLanguage,
      settings.nativeLanguage,
    );
    if (ctx.isInvalid) return;
    highlights.configure(settings);
    const parsingKeys = [
      "setupComplete",
      "studyLanguages",
      "paused",
      "enabledHosts",
      "disabledHosts",
      "wordLoading",
      "scanPopups",
      "udpipe",
      "udpipeModels",
      "nechybujte",
      "matureIntervalDays",
    ] as const;
    if (
      preservePopup &&
      !refreshDictionaries &&
      parsingKeys.every(
        (key) =>
          JSON.stringify(previous[key]) === JSON.stringify(settings[key]),
      )
    ) {
      if (
        JSON.stringify(previous.ignoredTags) !==
          JSON.stringify(settings.ignoredTags) ||
        previous.ignoreProperNames !== settings.ignoreProperNames
      )
        scanner.refreshTags();
      return;
    }
    input.cancel();
    active =
      settings.setupComplete &&
      (options.onLookup
        ? settings.scanPopups
        : isWebsiteEnabled(settings, location.hostname));
    console.info("[SrsReader] Reader configured", {
      context: options.onLookup ? "popup" : "page",
      active,
      studyLanguages: settings.studyLanguages,
      udpipeEnabled: settings.udpipe,
      settingsMs,
      totalMs: Math.round(performance.now() - started),
    });
    if (!active || !preservePopup) popup.close();
    scanner.reset();
  }
  const onMessage = (message: RuntimeEvent) => {
    if (message.event === "scanResult") {
      scanner.applyScanResult(message.session, message.text, message.result);
      return;
    }
    if (
      (message.event === "parsed" || message.event === "parsedOccurrence") &&
      active &&
      settings.studyLanguages.includes(message.language) &&
      message.candidates?.length
    ) {
      if (message.event === "parsedOccurrence")
        scanner.applyParsedOccurrence(message.occurrence, message.candidates);
      else if (message.term)
        scanner.applyParsedTerm(
          message.term,
          message.candidates,
          message.language,
        );
      return;
    }
    if (message.event === "closeLookup") popup.close();
    if (message.event === "changed") {
      if (message.scope === "frequency") return;
      if (message.word) {
        scanner.updateWord(message.word.id, message.word.state);
        return;
      }
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(
        () =>
          void configure(true, message.scope !== "settings").catch(
            console.warn,
          ),
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
