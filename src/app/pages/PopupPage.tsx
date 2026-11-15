import {
  Stack,
  ActionIcon,
  Button,
  Group,
  Loader,
  Switch,
  Text,
} from "@mantine/core";
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
import { useCallback, useEffect, useState } from "react";
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
  const [data, setData] = useState<Awaited<ReturnType<typeof loadPopupData>>>();
  const host = data?.host ?? "";
  const stats = data?.stats;
  const dictionaryCount = data?.dictionaryCount;
  const [error, setError] = useState("");
  const load = useCallback(() => {
    void loadPopupData()
      .then(setData)
      .catch((error) => setError(error.message));
  }, []);
  useEffect(load, [load]);
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
    <Stack gap="xs" p="md">
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
      {syncBusy && (
        <Text variant="supporting" role="status" aria-live="polite">
          {t(
            sync.status?.progress
              ? `sync_progress_${sync.status.progress.phase}`
              : "sync_in_progress",
          )}
        </Text>
      )}
      {!settings.setupComplete ? (
        <Button onClick={() => open("setup")} variant="filled">
          <SlidersHorizontal aria-hidden="true" size={16} /> {t("setup")}{" "}
        </Button>
      ) : dictionaryCount === 0 ? (
        <Group align="center">
          <Text>{t("no_dictionary_installed")}</Text>
          <Button
            onClick={() => open("settings/dictionaries")}
            variant="filled"
          >
            <Upload aria-hidden="true" size={16} />{" "}
            {t("import_dictionary")}{" "}
          </Button>
        </Group>
      ) : (
        <Button
          onClick={() => open("review")}
          variant="filled"
          aria-busy={!data && !error}
        >
          <BookOpen aria-hidden="true" size={16} /> {t("review")}{" "}
          {stats ? (
            <span>{stats.due}</span>
          ) : (
            !error && (
              <Loader size="xs" color="currentColor" aria-hidden="true" />
            )
          )}
        </Button>
      )}
      <Stack gap="xs">
        <Switch
          labelPosition="left"
          styles={{
            root: { width: "100%" },
            body: { minHeight: 44, justifyContent: "space-between" },
            labelWrapper: { flex: 1 },
            label: { paddingInlineStart: 0 },
          }}
          aria-label={t("parse_websites_automatically")}
          checked={!settings.paused}
          onChange={() => void toggle(false)}
          label={t("parse_websites_automatically")}
        />
        {host && (
          <Switch
            labelPosition="left"
            styles={{
              root: { width: "100%" },
              body: { minHeight: 44, justifyContent: "space-between" },
              labelWrapper: { flex: 1 },
              label: { paddingInlineStart: 0, overflowWrap: "anywhere" },
            }}
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
      </Stack>
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
