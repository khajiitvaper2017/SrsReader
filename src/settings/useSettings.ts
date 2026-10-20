import { installInputPrevention } from "@/reader/input-prevention";
import { defaults, type Settings } from "@/settings/model";
import { i18n, setInterfaceLanguage, t } from "@/shared/i18n/i18n";
import { rpc } from "@/shared/rpc";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { browser } from "wxt/browser";

export function useSettings(
  scope: "extensionPages" | "popups" = "extensionPages",
) {
  useTranslation(undefined, { i18n });
  const [settings, setSettings] = useState<Settings>(defaults);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const load = () => {
      void rpc({ action: "settings" })
        .then((value) => {
          setSettings(value);
          setReady(true);
        })
        .catch(console.error);
    };
    const changed = (message: { event?: string }) => {
      if (message.event === "changed") load();
    };
    load();
    browser.runtime.onMessage.addListener(changed);
    return () => browser.runtime.onMessage.removeListener(changed);
  }, []);
  useEffect(() => {
    void setInterfaceLanguage(
      settings.interfaceLanguage,
      settings.nativeLanguage,
    );
  }, [settings.interfaceLanguage, settings.nativeLanguage]);
  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage || "en";
    document.documentElement.dir = i18n.dir();
    document.title =
      scope === "popups" ? t("dictionary_page_title") : "SrsReader";
  }, [settings.nativeLanguage, i18n.resolvedLanguage, scope]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);
  useEffect(
    () => installInputPrevention(() => settings, scope),
    [settings, scope],
  );
  return [settings, setSettings, ready] as const;
}
