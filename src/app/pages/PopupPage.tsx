import { Stack, ActionIcon, Button, Group, Switch, Text } from "@mantine/core";
import { dictionariesClient } from "@/dictionaries/client";
import { settingsClient } from "@/settings/client";
import { useSettings } from "@/settings/hooks/useSettings";
import { useChanges } from "@/shared/hooks/useChanges";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { Logo } from "@/shared/ui/Logo";
import { srsClient } from "@/srs/client";
import {
  BookMarked,
  BookOpen,
  Settings,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { browser } from "wxt/browser";
export function Popup() {
  const [settings, setSettings] = useSettings();
  const [host, setHost] = useState("");
  const [stats, setStats] = useState({ total: 0, due: 0, known: 0, today: 0 });
  const [error, setError] = useState("");
  const [dictionaryCount, setDictionaryCount] = useState(0);
  const load = useCallback(() => {
    void Promise.all([
      srsClient({ action: "stats" }),
      dictionariesClient({ action: "dictionaries" }),
    ])
      .then(([stats, dictionaries]) => {
        setStats(stats);
        setDictionaryCount(
          dictionaries.filter((d) => d.enabled && d.count > 0).length,
        );
      })
      .catch((error) => setError(error.message));
  }, []);
  useEffect(load, [load]);
  useChanges(load, ["vocabulary", "srs", "settings", "dictionaries"]);
  useEffect(() => {
    void browser.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (tab?.url?.startsWith("http")) setHost(new URL(tab.url).hostname);
      });
  }, []);
  function open(page: string) {
    void browser.tabs.create({
      url: browser.runtime.getURL("/app.html") + `#${page}`,
    });
    window.close();
  }
  async function toggle(site: boolean) {
    try {
      const next = site
        ? {
            ...settings,
            disabledHosts: settings.disabledHosts.includes(host)
              ? settings.disabledHosts.filter((h) => h !== host)
              : [...settings.disabledHosts, host],
          }
        : { ...settings, paused: !settings.paused };
      setSettings(next);
      setSettings(await settingsClient({ action: "setSettings", value: next }));
    } catch (error) {
      setSettings(settings);
      setError((error as Error).message);
    }
  }
  return (
    <Stack gap="md" p="md">
      <Group align="center" justify="space-between" component="header">
        <Logo small />
      </Group>
      <ErrorBox error={error} />
      {!settings.setupComplete ? (
        <Button onClick={() => open("setup")} variant="filled">
          <SlidersHorizontal aria-hidden="true" size={16} /> {t("setup")}{" "}
        </Button>
      ) : !dictionaryCount ? (
        <Group align="center">
          <Text>{t("no_dictionary_installed")}</Text>
          <Button onClick={() => open("settings")} variant="filled">
            <Upload aria-hidden="true" size={16} />{" "}
            {t("import_dictionary")}{" "}
          </Button>
        </Group>
      ) : (
        <Button onClick={() => open("review")} variant="filled">
          <BookOpen aria-hidden="true" size={16} /> {t("review")}{" "}
          <span>{stats.due}</span>
        </Button>
      )}
      <Group align="center">
        <Switch
          aria-label={t("parse_websites")}
          checked={!settings.paused}
          onChange={() => void toggle(false)}
          label={<span>{t("parse_websites")}</span>}
        />
        {host && (
          <Switch
            aria-label={t("enabled_on_host", { host })}
            checked={!settings.disabledHosts.includes(host)}
            onChange={() => void toggle(true)}
            label={
              <Text component="span" inherit>
                {t("enabled_on_host", { host })}
              </Text>
            }
          />
        )}
      </Group>
      <Group align="center" justify="space-between" component="footer">
        <Button onClick={() => open("words")} variant="subtle">
          <BookMarked aria-hidden="true" size={16} /> {t("words")}{" "}
        </Button>
        <ActionIcon
          title={t("settings")}
          aria-label={t("settings")}
          onClick={() => open("settings")}
          variant="subtle"
        >
          <Settings aria-hidden="true" size={16} />
        </ActionIcon>
      </Group>
    </Stack>
  );
}
