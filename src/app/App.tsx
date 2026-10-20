import { ReviewPage } from "@/app/pages/ReviewPage";
import { SettingsPage } from "@/app/pages/SettingsPage";
import { WordsPage } from "@/app/pages/WordsPage";
import { stopAudio } from "@/audio/playback";
import { useSettings } from "@/settings/hooks/useSettings";
import { useChanges } from "@/shared/hooks/useChanges";
import { t } from "@/shared/i18n/i18n";
import { Logo } from "@/shared/ui/Logo";
import { srsClient } from "@/srs/client";
import {
  BookMarked,
  BookOpen,
  Settings as SettingsIcon,
  SlidersHorizontal,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";

const DocsPage = React.lazy(() => import("@/app/pages/DocsPage"));

export function App() {
  const [page, setPage] = useState(location.hash.slice(1) || "review");
  const [settings, setSettings, ready] = useSettings();
  const [stats, setStats] = useState({ total: 0, due: 0, known: 0, today: 0 });
  const loadStats = useCallback(() => {
    void srsClient({ action: "stats" }).then(setStats).catch(console.error);
  }, []);
  useEffect(loadStats, [loadStats]);
  useChanges(loadStats);
  useEffect(() => {
    const timer = setInterval(loadStats, 60000);
    return () => clearInterval(timer);
  }, [loadStats]);
  useEffect(() => {
    const hash = () => {
      setPage(location.hash.slice(1) || "review");
      stopAudio();
    };
    addEventListener("hashchange", hash);
    return () => removeEventListener("hashchange", hash);
  }, []);
  const docs = page === "docs" || page.startsWith("docs/");
  const inSetup = page === "setup" || !settings.setupComplete;
  const setup = inSetup && !docs;
  if (!ready) return null;
  return (
    <div
      className={`app-shell ${settings.hideDictionarySources ? "hide-dictionary-sources" : ""}`}
    >
      <main className="app-main">
        <header className="app-header">
          <a href="#review" className="brand-link">
            <Logo small />
          </a>
          <nav aria-label={t("pages")}>
            {(inSetup
              ? [
                  ["setup", t("setup")],
                  ["docs", t("docs")],
                ]
              : [
                  ["review", t("review")],
                  ["words", t("words")],
                  ["settings", t("settings")],
                  ["docs", t("docs")],
                ]
            ).map(([id, label]) => (
              <a
                className={page.split("/")[0] === id ? "active" : ""}
                href={`#${id}`}
                key={id}
              >
                {id === "review" ? (
                  <BookOpen aria-hidden="true" />
                ) : id === "words" ? (
                  <BookMarked aria-hidden="true" />
                ) : id === "settings" ? (
                  <SettingsIcon aria-hidden="true" />
                ) : id === "docs" ? (
                  <BookOpen aria-hidden="true" />
                ) : (
                  <SlidersHorizontal aria-hidden="true" />
                )}
                {label}
                {id === "review" && stats.due > 0 && (
                  <span className="nav-count">{stats.due}</span>
                )}
              </a>
            ))}
          </nav>
        </header>
        <div className="page-content">
          {docs ? (
            <React.Suspense fallback={null}>
              <DocsPage topic={page.split("/")[1] || "getting-started"} />
            </React.Suspense>
          ) : setup ? (
            <SettingsPage settings={settings} setSettings={setSettings} setup />
          ) : page === "settings" ? (
            <SettingsPage settings={settings} setSettings={setSettings} />
          ) : page === "words" ? (
            <WordsPage settings={settings} />
          ) : (
            <ReviewPage settings={settings} stats={stats} />
          )}
        </div>
      </main>
    </div>
  );
}
