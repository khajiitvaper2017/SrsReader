import { logScanWarning, type RuntimeEvent } from "@/platform/messaging/events";
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
  const scope = options.scope || (options.onLookup ? "popups" : "webpages");
  const excluded = excludedSelector;
  let settings: Settings = defaults;
  let active = false;
  let configurationRevision = 0;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const highlights = createHighlights(settings);
  const scanner = createScanner(
    root,
    excluded,
    options,
    () => settings,
    () => active,
    highlights,
  );
  const popup = createPopup(options, () => settings, highlights, scanner);
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
  const removeInputPrevention =
    scope === "webpages"
      ? installInputPrevention(() => (active ? settings : undefined), scope)
      : () => {};
  ctx.onInvalidated(removeInputPrevention);
  async function configure(preservePopup = false, refreshDictionaries = false) {
    if (ctx.isInvalid) return;
    const revision = ++configurationRevision;
    const previous = settings;
    const nextSettings =
      !preservePopup && options.settings
        ? options.settings
        : await settingsClient({ action: "settings" });
    if (ctx.isInvalid || revision !== configurationRevision) return;
    await setInterfaceLanguage(
      nextSettings.interfaceLanguage,
      nextSettings.nativeLanguage,
    );
    if (ctx.isInvalid || revision !== configurationRevision) return;
    settings = nextSettings;
    highlights.configure(settings);
    const parsingKeys = [
      "setupComplete",
      "studyLanguages",
      "paused",
      "enabledHosts",
      "disabledHosts",
      "wordLoading",
      "splitGermanCompounds",
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
      (scope !== "webpages" || isWebsiteEnabled(settings, location.hostname));
    if (!active || !preservePopup) popup.close(!active);
    scanner.reset();
    preloadPopup();
  }
  function preloadPopup() {
    if (!active || scope !== "webpages" || document.hidden) return;
    requestIdleCallback(() => {
      if (active && !document.hidden) popup.preload();
    });
  }
  const onMessage = (message: RuntimeEvent) => {
    if (message.event === "scanWarning") {
      logScanWarning(message.message, message.details);
      return;
    }
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
        scanner.applyParsedOccurrence(
          message.occurrence,
          message.candidates,
          message.encounterKey,
        );
      else if (message.term)
        scanner.applyParsedTerm(
          message.term,
          message.candidates,
          message.language,
          message.encounterKey,
        );
      return;
    }
    if (message.event === "closeLookup") popup.close();
    if (message.event === "changed") {
      if (message.scope === "sync") return;
      if (message.word) {
        scanner.updateWord(message.word.id, message.word);
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
  ctx.addEventListener(document, "visibilitychange", () => {
    if (document.hidden && !popup.element) popup.close(true);
    if (!document.hidden) preloadPopup();
  });
  ctx.onInvalidated(() => {
    active = false;
    clearTimeout(refreshTimer);
    input.dispose();
    scanner.dispose();
    popup.close(true);
    highlights.dispose();
    browser.runtime.onMessage.removeListener(onMessage);
  });
}
