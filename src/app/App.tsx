import {
  ActionIcon,
  AppShell,
  Anchor,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Menu,
} from "@mantine/core";

import { stopAudio } from "@/audio/playback";
import { useSettings } from "@/settings/hooks/useSettings";
import { useSettingsTask } from "@/settings/hooks/useSettingsTask";
import { useChanges } from "@/shared/hooks/useChanges";
import { t } from "@/shared/i18n/i18n";
import { Logo } from "@/shared/ui/Logo";
import { TaskAlerts } from "@/shared/ui/TaskAlerts";
import { srsClient } from "@/srs/client";
import {
  BookMarked,
  BookOpen,
  Menu as MenuIcon,
  Search,
  Settings as SettingsIcon,
  SlidersHorizontal,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
const ReviewPage = React.lazy(() =>
  import("@/app/pages/ReviewPage").then((module) => ({
    default: module.ReviewPage,
  })),
);
const StudyPage = React.lazy(() =>
  import("@/app/pages/StudyPage").then((module) => ({
    default: module.StudyPage,
  })),
);
const SettingsPage = React.lazy(() =>
  import("@/app/pages/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);
const WordsPage = React.lazy(() =>
  import("@/app/pages/WordsPage").then((module) => ({
    default: module.WordsPage,
  })),
);
const SearchPage = React.lazy(() =>
  import("@/app/pages/SearchPage").then((module) => ({
    default: module.SearchPage,
  })),
);
const DocsPage = React.lazy(() => import("@/app/pages/DocsPage"));
export function App() {
  const [hash, setHash] = useState(location.hash.slice(1) || "review");
  const [page = "review", query] = hash.split("?");
  const params = new URLSearchParams(query);
  const [settings, setSettings] = useSettings();
  const tasks = useSettingsTask();
  const [stats, setStats] = useState<{
    total: number;
    due: number;
    known: number;
    today: number;
  }>({ total: 0, due: 0, known: 0, today: 0 });
  const loadStats = useCallback(() => {
    void srsClient({ action: "stats" }).then(setStats).catch(console.error);
  }, []);
  useEffect(loadStats, [loadStats]);
  useChanges(loadStats, ["vocabulary", "srs", "settings", "collection"]);
  useEffect(() => {
    const timer = setInterval(loadStats, 60000);
    return () => clearInterval(timer);
  }, [loadStats]);
  useEffect(() => {
    const hash = () => {
      setHash(location.hash.slice(1) || "review");
      stopAudio();
    };
    addEventListener("hashchange", hash);
    return () => removeEventListener("hashchange", hash);
  }, []);
  const docs = page === "docs" || page.startsWith("docs/");
  const reviewing =
    page === "review/session" || page.startsWith("review/session/");
  const reviewLanguage = page.split("/")[2] || settings.studyLanguage;
  const reviewSettings = useMemo(
    () => ({ ...settings, studyLanguage: reviewLanguage }),
    [settings, reviewLanguage],
  );
  const deckId = reviewing ? page.split("/")[3] : undefined;
  const inSetup = page === "setup" || !settings.setupComplete;
  const setup = inSetup && !docs;
  const links = (
    inSetup
      ? [
          { id: "setup", label: t("setup"), icon: SlidersHorizontal },
          { id: "docs", label: t("docs"), icon: BookOpen },
        ]
      : [
          { id: "review", label: t("study_languages"), icon: BookOpen },
          { id: "words", label: t("words"), icon: BookMarked },
          { id: "search", label: t("search"), icon: Search },
          { id: "settings", label: t("settings"), icon: SettingsIcon },
          { id: "docs", label: t("docs"), icon: BookOpen },
        ]
  ).map((link) => ({
    ...link,
    active: page.split("/")[0] === link.id,
    badge:
      link.id === "review" && stats.due > 0 ? (
        <Badge>{stats.due}</Badge>
      ) : undefined,
  }));
  return (
    <AppShell header={{ height: 58 }} padding={{ base: "xs", sm: "md" }}>
      <AppShell.Header>
        <Container size="lg" h="100%" px={{ base: "xs", sm: "md" }}>
          <Group h="100%" justify="space-between" wrap="nowrap" gap="xs">
            <Anchor href="#review" underline="never" c="inherit">
              <Logo small />
            </Anchor>
            {reviewing ? (
              <Button component="a" href="#review" miw={0}>
                {t("study_end_session")}
              </Button>
            ) : (
              <>
                <Group
                  component="nav"
                  aria-label={t("pages")}
                  visibleFrom="md"
                  gap="xs"
                  wrap="nowrap"
                >
                  {links.map(({ id, label, icon: Icon, active, badge }) => (
                    <Button
                      component="a"
                      key={id}
                      href={`#${id}`}
                      variant={active ? "light" : "subtle"}
                      aria-current={active ? "page" : undefined}
                      leftSection={<Icon size={16} />}
                      rightSection={badge}
                    >
                      {label}
                    </Button>
                  ))}
                </Group>
                <Menu>
                  <Menu.Target>
                    <ActionIcon
                      hiddenFrom="md"
                      size="input-md"
                      aria-label={t("pages")}
                    >
                      <MenuIcon aria-hidden size={20} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown hiddenFrom="md">
                    {links.map(({ id, label, icon: Icon, active, badge }) => (
                      <Menu.Item
                        component="a"
                        key={id}
                        href={`#${id}`}
                        aria-current={active ? "page" : undefined}
                        leftSection={<Icon size={16} />}
                        rightSection={badge}
                      >
                        {label}
                      </Menu.Item>
                    ))}
                  </Menu.Dropdown>
                </Menu>
              </>
            )}
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container size={reviewing ? "sm" : "lg"} px={0}>
          <React.Suspense fallback={<Loader aria-label={t("working")} />}>
            {docs ? (
              <React.Suspense fallback={<Loader aria-label={t("working")} />}>
                <DocsPage topic={page.split("/")[1] || "getting-started"} />
              </React.Suspense>
            ) : setup ? (
              <SettingsPage
                settings={settings}
                setSettings={setSettings}
                tasks={tasks}
                language={params.get("language") || undefined}
                dictionaryTab={params.get("dictionary") || undefined}
                setup
              />
            ) : page === "settings" || page.startsWith("settings/") ? (
              <SettingsPage
                settings={settings}
                setSettings={setSettings}
                tasks={tasks}
                tab={page.split("/")[1]}
                language={params.get("language") || undefined}
                dictionaryTab={params.get("dictionary") || undefined}
              />
            ) : page === "words" || page.startsWith("words/") ? (
              <WordsPage
                key={page}
                settings={settings}
                language={page.split("/")[1] || settings.studyLanguage}
                deckId={page.split("/")[2]}
              />
            ) : page === "search" ? (
              <SearchPage settings={settings} />
            ) : reviewing &&
              settings.studyLanguages.includes(reviewLanguage) ? (
              <ReviewPage
                key={`${reviewLanguage}:${deckId || ""}`}
                settings={reviewSettings}
                deckId={deckId}
              />
            ) : (
              <StudyPage settings={settings} setSettings={setSettings} />
            )}
          </React.Suspense>
        </Container>
      </AppShell.Main>
      <TaskAlerts
        busy={tasks.busy}
        progress={tasks.progress}
        error={tasks.error}
        notice={tasks.notice}
        onDismissError={() => {
          tasks.setError("");
          void tasks.dismissImport();
        }}
        onDismissNotice={() => {
          tasks.setNotice("");
          void tasks.dismissImport();
        }}
      />
    </AppShell>
  );
}
