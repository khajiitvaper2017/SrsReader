import {
  AppShell,
  Anchor,
  Badge,
  Button,
  Container,
  Group,
} from "@mantine/core";
import { ReviewPage } from "@/app/pages/ReviewPage";
import { StudyPage } from "@/app/pages/StudyPage";
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
  const [stats, setStats] = useState<{
    total: number;
    due: number;
    known: number;
    today: number;
  }>();
  const loadStats = useCallback(() => {
    void srsClient({ action: "stats" }).then(setStats).catch(console.error);
  }, []);
  useEffect(loadStats, [loadStats]);
  useChanges(loadStats, ["vocabulary", "srs", "settings"]);
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
  const reviewing =
    page === "review/session" || page.startsWith("review/session/");
  const deckId = reviewing ? page.split("/")[2] : undefined;
  const inSetup = page === "setup" || !settings.setupComplete;
  const setup = inSetup && !docs;
  if (!ready || !stats) return null;
  return (
    <AppShell header={{ height: { base: 100, sm: 58 } }} padding="md">
      <AppShell.Header>
        <Container size="lg" h="100%">
          <Group h="100%" justify="space-between">
            <Anchor href="#review" underline="never" c="inherit">
              <Logo small />
            </Anchor>
            {reviewing ? (
              <Button component="a" href="#review">
                {t("study_end_session")}
              </Button>
            ) : (
              <Group component="nav" aria-label={t("pages")} align="stretch">
                {(inSetup
                  ? [
                      ["setup", t("setup")],
                      ["docs", t("docs")],
                    ]
                  : [
                      ["review", t("study_languages")],
                      ["words", t("words")],
                      ["settings", t("settings")],
                      ["docs", t("docs")],
                    ]
                ).map(([id, label]) => (
                  <Button
                    component="a"
                    key={id}
                    href={`#${id}`}
                    variant={page.split("/")[0] === id ? "light" : "subtle"}
                    aria-current={
                      page.split("/")[0] === id ? "page" : undefined
                    }
                    leftSection={
                      id === "review" || id === "docs" ? (
                        <BookOpen size={16} />
                      ) : id === "words" ? (
                        <BookMarked size={16} />
                      ) : id === "settings" ? (
                        <SettingsIcon size={16} />
                      ) : (
                        <SlidersHorizontal size={16} />
                      )
                    }
                    rightSection={
                      id === "review" && stats.due > 0 ? (
                        <Badge>{stats.due}</Badge>
                      ) : undefined
                    }
                  >
                    {label}
                  </Button>
                ))}
              </Group>
            )}
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container size={reviewing ? "sm" : "lg"} px={0}>
          {docs ? (
            <React.Suspense fallback={null}>
              <DocsPage topic={page.split("/")[1] || "getting-started"} />
            </React.Suspense>
          ) : setup ? (
            <SettingsPage settings={settings} setSettings={setSettings} setup />
          ) : page === "settings" || page.startsWith("settings/") ? (
            <SettingsPage
              settings={settings}
              setSettings={setSettings}
              tab={page.split("/")[1]}
            />
          ) : page === "words" || page.startsWith("words/") ? (
            <WordsPage
              key={page}
              settings={settings}
              language={page.split("/")[1] || settings.studyLanguage}
              deckId={page.split("/")[2]}
            />
          ) : reviewing ? (
            <ReviewPage
              key={`${settings.studyLanguage}:${deckId || ""}`}
              settings={settings}
              stats={stats}
              deckId={deckId}
            />
          ) : (
            <StudyPage settings={settings} setSettings={setSettings} />
          )}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
