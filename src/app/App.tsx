import {
  AppShell,
  Anchor,
  Badge,
  Box,
  Button,
  Container,
  Drawer,
  NavLink,
  ScrollArea,
  Stack,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

import { stopAudio } from "@/audio/playback";
import { useSettings } from "@/settings/hooks/useSettings";
import { useSettingsTask } from "@/settings/hooks/useSettingsTask";
import { settingsSections } from "@/settings/navigation";
import { t } from "@/shared/i18n/i18n";
import { Logo } from "@/shared/ui/Logo";
import { PageHeaderContext } from "@/shared/ui/PageHeader";
import { TaskAlerts } from "@/shared/ui/TaskAlerts";
import { useStudyOverview } from "@/srs/hooks/useStudyOverview";
import { useSync, useSyncLifecycle } from "@/sync/hooks/useSync";
import {
  BookMarked,
  BookOpen,
  Search,
  Settings as SettingsIcon,
} from "lucide-react";
import React, { useEffect, useMemo, useState, type MouseEvent } from "react";
const loadReviewPage = () => import("@/app/pages/ReviewPage");
// Initial study navigation must not wait for Suspense's fallback minimum.
const ReviewPage = location.hash.startsWith("#review/session")
  ? (await loadReviewPage()).ReviewPage
  : React.lazy(() =>
      loadReviewPage().then((module) => ({
        default: module.ReviewPage,
      })),
    );
const loadStudyPage = () =>
  import("@/app/pages/StudyPage").then((module) => ({
    default: module.StudyPage,
  }));
const loadSettingsPage = () =>
  import("@/app/pages/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  }));
const loadWordsPage = () =>
  import("@/app/pages/WordsPage").then((module) => ({
    default: module.WordsPage,
  }));
const loadSearchPage = () =>
  import("@/app/pages/SearchPage").then((module) => ({
    default: module.SearchPage,
  }));
const StudyPage = React.lazy(loadStudyPage);
const SettingsPage = React.lazy(loadSettingsPage);
const WordsPage = React.lazy(loadWordsPage);
const SearchPage = React.lazy(loadSearchPage);
const ChangelogPage = React.lazy(() =>
  import("@/app/pages/ChangelogPage").then((module) => ({
    default: module.ChangelogPage,
  })),
);
const menuPages = {
  review: loadStudyPage,
  settings: loadSettingsPage,
  words: loadWordsPage,
  search: loadSearchPage,
};
const warmedMenuPages = new Set<keyof typeof menuPages>();

function preloadMenuPage(page: keyof typeof menuPages) {
  warmedMenuPages.add(page);
  return menuPages[page]().catch(() => {
    warmedMenuPages.delete(page);
  });
}
export function App() {
  useSyncLifecycle();
  const sync = useSync();
  const [hash, setHash] = useState(location.hash.slice(1) || "review");
  const [page = "review", query] = hash.split("?");
  const params = new URLSearchParams(query);
  const [settings, setSettings] = useSettings();
  const tasks = useSettingsTask();
  const theme = useMantineTheme();
  const desktop = useMediaQuery(`(min-width: ${theme.breakpoints.md})`);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [headerTarget, setHeaderTarget] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    setNavigationOpen(false);
  }, [hash, desktop]);
  useEffect(() => {
    const hash = () => {
      React.startTransition(() => setHash(location.hash.slice(1) || "review"));
      stopAudio();
    };
    addEventListener("hashchange", hash);
    return () => removeEventListener("hashchange", hash);
  }, []);
  const reviewing =
    page === "review/session" || page.startsWith("review/session/");
  const reviewLanguage = page.split("/")[2] || settings.studyLanguage;
  const reviewSettings = useMemo(
    () => ({ ...settings, studyLanguage: reviewLanguage }),
    [settings, reviewLanguage],
  );
  const deckId = reviewing
    ? decodeURIComponent(page.split("/")[3] || "") || undefined
    : undefined;
  const setup = page === "setup" || !settings.setupComplete;
  const root = page.split("/")[0] || "review";
  const inReviewSession =
    reviewing && settings.studyLanguages.includes(reviewLanguage);
  const { overview, error: overviewError } = useStudyOverview(
    !setup && !inReviewSession,
  );
  const due =
    overview?.reduce(
      (sum, row) => sum + row.fresh + row.learning + row.due,
      0,
    ) ?? 0;
  useEffect(() => {
    if (desktop || setup || reviewing) return;
    let cancelled = false;
    let idle: number | undefined;
    const pages = (Object.keys(menuPages) as (keyof typeof menuPages)[]).filter(
      (page) => page !== root,
    );
    function warmNext() {
      if (cancelled || document.hidden) return;
      const page = pages.shift();
      if (!page) return;
      if (warmedMenuPages.has(page)) {
        warmNext();
        return;
      }
      idle = requestIdleCallback(() => {
        if (!document.hidden) void preloadMenuPage(page).then(warmNext);
      });
    }
    const current = Object.hasOwn(menuPages, root)
      ? menuPages[root as keyof typeof menuPages]()
      : loadStudyPage();
    void current.then(warmNext, () => {});
    return () => {
      cancelled = true;
      if (idle !== undefined) cancelIdleCallback(idle);
    };
  }, [desktop, setup, reviewing, root]);
  const links = [
    { id: "review", label: t("study_languages"), icon: BookOpen },
    { id: "words", label: t("words"), icon: BookMarked },
    { id: "search", label: t("search"), icon: Search },
    { id: "settings", label: t("settings"), icon: SettingsIcon },
  ] as const;
  const settingsSection =
    root === "settings" ? page.split("/")[1] || "general" : "";
  function followMenuLink(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const destination = event.currentTarget.hash;
    event.preventDefault();
    if (destination !== location.hash) location.hash = destination;
    setNavigationOpen(false);
  }
  const navigation = () => (
    <Stack component="nav" aria-label={t("pages")} gap="xs">
      {links.map(({ id, label, icon: Icon }) => (
        <React.Fragment key={id}>
          <NavLink
            component="a"
            href={`#${id === "settings" ? "settings/general" : id}`}
            label={label}
            active={root === id}
            aria-current={
              id !== "settings" && root === id && !page.includes("/")
                ? "page"
                : undefined
            }
            leftSection={<Icon aria-hidden size={20} />}
            rightSection={
              id === "review" && due > 0 ? <Badge>{due}</Badge> : undefined
            }
            onClick={followMenuLink}
            mih={44}
          />
          {id === "settings" && (
            <Stack gap={0} pl="xl">
              {settingsSections.map(({ value, label, icon: Icon }) => (
                <NavLink
                  component="a"
                  key={value}
                  href={`#settings/${value}${query ? `?${query}` : ""}`}
                  label={t(label)}
                  leftSection={<Icon aria-hidden size={20} />}
                  active={settingsSection === value}
                  aria-current={settingsSection === value ? "page" : undefined}
                  onClick={followMenuLink}
                  mih={44}
                />
              ))}
            </Stack>
          )}
        </React.Fragment>
      ))}
      <Button
        component="a"
        href="https://github.com/khajiitvaper2017/SrsReader/issues/new"
        target="_blank"
        rel="noopener noreferrer"
        variant="subtle"
        w="fit-content"
        onClick={() => setNavigationOpen(false)}
      >
        {t("report_issue")}
      </Button>
    </Stack>
  );
  return (
    <PageHeaderContext.Provider
      value={{
        target: headerTarget,
        openNavigation: setup ? undefined : () => setNavigationOpen(true),
      }}
    >
      <AppShell
        layout="alt"
        header={{ height: 64, collapsed: reviewing }}
        navbar={{
          width: 240,
          breakpoint: "md",
          collapsed: { mobile: true, desktop: reviewing || setup },
        }}
        padding={0}
      >
        {!reviewing && (
          <AppShell.Header>
            <Container size="lg" h="100%" px="md">
              <Box ref={setHeaderTarget} h="100%" />
            </Container>
          </AppShell.Header>
        )}
        {!reviewing && !setup && (
          <>
            {desktop && (
              <AppShell.Navbar visibleFrom="md">
                <AppShell.Section
                  grow
                  component={ScrollArea}
                  type="auto"
                  scrollbars="y"
                >
                  <Stack p="md" gap={0}>
                    <Anchor
                      href="#review"
                      underline="never"
                      c="inherit"
                      mb="md"
                      mih={32}
                    >
                      <Logo small />
                    </Anchor>
                    {navigation()}
                  </Stack>
                </AppShell.Section>
              </AppShell.Navbar>
            )}
            {!desktop && (
              <Drawer
                opened={navigationOpen && !desktop}
                onClose={() => setNavigationOpen(false)}
                keepMounted
                transitionProps={{ duration: 150 }}
                title={<Logo small />}
                closeButtonProps={{ "aria-label": t("close"), size: "xl" }}
                scrollAreaComponent={ScrollArea.Autosize}
                size="min(18rem, calc(100vw - 2.75rem))"
                padding="md"
                onExitTransitionEnd={() => {
                  if (!desktop)
                    headerTarget
                      ?.querySelector<HTMLButtonElement>(
                        "[data-navigation-trigger]",
                      )
                      ?.focus({ preventScroll: true });
                }}
              >
                {navigation()}
              </Drawer>
            )}
          </>
        )}
        <AppShell.Main>
          <Container size={reviewing ? "sm" : "lg"} p="md">
            <React.Suspense fallback={null}>
              {setup ? (
                <SettingsPage
                  settings={settings}
                  setSettings={setSettings}
                  tasks={tasks}
                  language={params.get("language") || undefined}
                  dictionaryTab={params.get("dictionary") || undefined}
                  setup
                />
              ) : page === "settings/changelog" ? (
                <ChangelogPage />
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
                  selected={params.get("word") || ""}
                  language={page.split("/")[1] || settings.studyLanguage}
                  deckId={
                    decodeURIComponent(page.split("/")[2] || "") || undefined
                  }
                />
              ) : page === "search" ? (
                <SearchPage settings={settings} />
              ) : inReviewSession ? (
                <ReviewPage
                  key={`${reviewLanguage}:${deckId || ""}`}
                  settings={reviewSettings}
                  deckId={deckId}
                />
              ) : (
                <StudyPage
                  settings={settings}
                  setSettings={setSettings}
                  sync={sync}
                  overview={overview}
                  overviewError={overviewError}
                />
              )}
            </React.Suspense>
          </Container>
        </AppShell.Main>
        <TaskAlerts
          busy={
            tasks.busy || (page !== "settings/sync" && sync.status?.running)
          }
          busyLabel={
            !tasks.busy && sync.status?.running
              ? t(
                  sync.status.progress
                    ? `sync_progress_${sync.status.progress.phase}`
                    : "sync_in_progress",
                )
              : undefined
          }
          progress={tasks.busy ? tasks.progress : undefined}
          error={tasks.error}
          notice={tasks.notice}
          onDismissError={() => {
            tasks.setError("");
            void tasks.dismissImportResult();
          }}
          onDismissNotice={() => {
            tasks.setNotice("");
            void tasks.dismissImportResult();
          }}
        />
      </AppShell>
    </PageHeaderContext.Provider>
  );
}
