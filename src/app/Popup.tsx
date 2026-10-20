import { rpc } from "@/platform/messaging/send";
import { useSettings } from "@/settings/useSettings";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { Logo } from "@/shared/ui/Logo";
import { useChanges } from "@/shared/useChanges";
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
      rpc({ action: "stats" }),
      rpc({ action: "dictionaries" }),
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
  useChanges(load);
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
      setSettings(await rpc({ action: "setSettings", value: next }));
    } catch (error) {
      setSettings(settings);
      setError((error as Error).message);
    }
  }
  return (
    <div className="toolbar-shell">
      <header className="row between">
        <Logo small />
      </header>
      <ErrorBox error={error} />
      {!settings.setupComplete ? (
        <button
          className="primary toolbar-review"
          onClick={() => open("setup")}
        >
          <SlidersHorizontal aria-hidden="true" /> {t("setup")}{" "}
        </button>
      ) : !dictionaryCount ? (
        <div className="toolbar-setup">
          <p>{t("no_dictionary_installed")}</p>
          <button className="primary" onClick={() => open("settings")}>
            <Upload aria-hidden="true" /> {t("import_dictionary")}{" "}
          </button>
        </div>
      ) : (
        <button
          className="primary toolbar-review"
          onClick={() => open("review")}
        >
          <BookOpen aria-hidden="true" /> {t("review")} <span>{stats.due}</span>
        </button>
      )}
      <div className="toolbar-controls">
        <label className="toggle-row">
          <span>{t("parse_websites")}</span>
          <input
            type="checkbox"
            role="switch"
            checked={!settings.paused}
            onChange={() => void toggle(false)}
          />
        </label>
        {host && (
          <label className="toggle-row">
            <span className="truncate">{t("enabled_on_host", { host })}</span>
            <input
              type="checkbox"
              role="switch"
              checked={!settings.disabledHosts.includes(host)}
              onChange={() => void toggle(true)}
            />
          </label>
        )}
      </div>
      <footer className="row between">
        <button className="quiet" onClick={() => open("words")}>
          <BookMarked aria-hidden="true" /> {t("words")}{" "}
        </button>
        <button
          title={t("settings")}
          aria-label={t("settings")}
          className="quiet icon-button"
          onClick={() => open("settings")}
        >
          <Settings aria-hidden="true" />
        </button>
      </footer>
    </div>
  );
}
