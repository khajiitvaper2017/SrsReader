import { Stack, ActionIcon, Button, Group, Switch, Text } from "@mantine/core";
import { dictionariesClient } from "@/dictionaries/client";
import { isWebsiteEnabled } from "@/reader/preferences";
import { settingsClient } from "@/settings/client";
import { useSettings } from "@/settings/hooks/useSettings";
import { useChanges } from "@/shared/hooks/useChanges";
import { i18n, t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { Logo } from "@/shared/ui/Logo";
import { srsClient } from "@/srs/client";
import { useSync } from "@/sync/hooks/useSync";
import {
  BookMarked,
  BookOpen,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { useCallback, useState } from "react";
import { browser } from "wxt/browser";

async function loadPopupData() {
  const [stats, dictionaries, [tab]] = await Promise.all([
    srsClient({ action: "stats" }),
    dictionariesClient({ action: "dictionaries" }),
    browser.tabs.query({ active: true, currentWindow: true }),
  ]);
  return {
    stats,
    dictionaryCount: dictionaries.filter((d) => d.enabled && d.count > 0)
      .length,
    host: tab?.url?.startsWith("http") ? new URL(tab.url).hostname : "",
  };
}

const initial = await loadPopupData()
  .then((data) => ({ data, error: "" }))
  .catch((error: Error) => ({
    data: {
      stats: { total: 0, due: 0, known: 0, today: 0 },
      dictionaryCount: 0,
      host: "",
    },
    error: error.message,
  }));

export function Popup() {
  const [settings, setSettings] = useSettings();
  const sync = useSync();
  const canSync = sync.status?.connected && !sync.status.authorizationRequired;
  const syncBusy = !!sync.operation || !!sync.status?.running;
  const syncLabel = t(canSync ? "sync_now" : "sync_title");
  const syncErrorKey = sync.error?.toLowerCase();
  const syncError = sync.error
    ? syncErrorKey && i18n.exists(syncErrorKey)
      ? t(syncErrorKey)
      : t("sync_error_detail", { detail: sync.error })
    : "";
  const [{ host, stats, dictionaryCount }, setData] = useState(initial.data);
  const [error, setError] = useState(initial.error);
  const load = useCallback(() => {
    void loadPopupData()
      .then(setData)
      .catch((error) => setError(error.message));
  }, []);
  useChanges(load, [
    "vocabulary",
    "srs",
    "settings",
    "dictionaries",
    "collection",
  ]);
  function open(page: string) {
    void browser.tabs.create({
      url: browser.runtime.getURL("/app.html") + `#${page}`,
    });
    window.close();
  }
  async function toggle(site: boolean) {
    try {
      const enabled = !isWebsiteEnabled(settings, host);
      const next = site
        ? {
            ...settings,
            enabledHosts: enabled
              ? [...settings.enabledHosts, host]
              : settings.enabledHosts.filter((h) => h !== host),
            disabledHosts: enabled
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
        <ActionIcon
          title={syncLabel}
          aria-label={syncLabel}
          aria-busy={syncBusy}
          loading={syncBusy}
          disabled={sync.loading || !sync.status}
          variant="subtle"
          onClick={() => {
            if (canSync) void sync.syncNow();
            else open("settings/sync");
          }}
        >
          <RefreshCw aria-hidden="true" size={16} />
        </ActionIcon>
      </Group>
      <ErrorBox error={error || syncError} />
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
          aria-label={t("parse_websites_automatically")}
          checked={!settings.paused}
          onChange={() => void toggle(false)}
          label={t("parse_websites_automatically")}
        />
        {host && (
          <Switch
            aria-label={t("enabled_on_host", { host })}
            checked={isWebsiteEnabled(settings, host)}
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
