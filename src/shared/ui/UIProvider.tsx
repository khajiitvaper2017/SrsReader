import type { ChangeMessage } from "@/platform/messaging/events";
import { installInputPrevention } from "@/reader/input-prevention";
import { getUISettings } from "@/settings/client";
import type { Settings } from "@/settings/model";
import { i18n, setInterfaceLanguage, t } from "@/shared/i18n/i18n";
import {
  createContext,
  useEffect,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { MantineProvider } from "@mantine/core";
import { useColorScheme } from "@mantine/hooks";
import { createUITheme } from "@/shared/ui/theme";
import type { PageScope } from "@/reader/input-prevention";
import { useTranslation } from "react-i18next";
import { browser } from "wxt/browser";
import { TranslationModelPrompt } from "@/translation/components/TranslationModelPrompt";

export const SettingsContext = createContext<
  readonly [Settings, Dispatch<SetStateAction<Settings>>]
>(undefined!);
const colorSchemeManager = {
  get: () => "auto" as const,
  set: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
  clear: () => {},
};

const initialSettings = await getUISettings();
const initialScheme =
  initialSettings.theme === "system"
    ? matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : initialSettings.theme === "oled"
      ? "dark"
      : initialSettings.theme;
document.documentElement.dataset.mantineColorScheme = initialScheme;

export function UIProvider({
  scope,
  popup = false,
  children,
}: {
  scope: PageScope;
  popup?: boolean;
  children: ReactNode;
}) {
  useTranslation(undefined, { i18n });
  const [settings, setSettings] = useState<Settings>(initialSettings);
  useEffect(() => {
    const load = () => {
      void getUISettings().then(setSettings).catch(console.error);
    };
    const changed = (message: ChangeMessage) => {
      if (
        message.event === "changed" &&
        ["collection", "settings", "dictionaries"].includes(message.scope)
      )
        load();
    };
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
  useEffect(
    () => installInputPrevention(() => settings, scope),
    [settings, scope],
  );
  const systemScheme = useColorScheme(initialScheme);
  return (
    <SettingsContext.Provider value={[settings, setSettings]}>
      <MantineProvider
        theme={createUITheme(settings, popup)}
        colorSchemeManager={colorSchemeManager}
        forceColorScheme={
          settings.theme === "system"
            ? systemScheme
            : settings.theme === "oled"
              ? "dark"
              : settings.theme
        }
      >
        {children}
        <TranslationModelPrompt />
      </MantineProvider>
    </SettingsContext.Provider>
  );
}
