import { dictionariesClient } from "@/dictionaries/client";
import type { LookupResult, LookupWord } from "@/dictionaries/model";
import { folded } from "@/languages/text";
import { lookupClient } from "@/lookup/client";
import type { LookupPage } from "@/lookup/model";
import { startReader } from "@/reader/controller";
import { settingsClient } from "@/settings/client";
import { useSettings } from "@/settings/hooks/useSettings";
import { useChanges } from "@/shared/hooks/useChanges";
import { t } from "@/shared/i18n/i18n";
import { srsClient } from "@/srs/client";
import { useReviewClock } from "@/srs/hooks/useReviewClock";
import { vocabularyClient } from "@/vocabulary/client";
import {
  wordId,
  type ReadingContext,
  type Vocabulary,
} from "@/vocabulary/model";
import { useCallback, useEffect, useState } from "react";
import { ContentScriptContext } from "wxt/utils/content-script-context";

export function useLookupWord({
  page,
  onLookup,
  onBack,
}: {
  page: LookupPage;
  onLookup: (
    term: string,
    context: ReadingContext,
    selected: string,
    scroll: number,
    openDetails: number[],
  ) => void;
  onBack?: () => void;
  onContext: (context: ReadingContext) => void;
}) {
  const [settings, setSettings] = useSettings("popups");
  const [result, setResult] = useState<LookupResult>();
  const { term, context } = page;
  const [selected, setSelected] = useState(page.selected || "");
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<Vocabulary>();
  const [times, setTimes] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [lastReview, setLastReview] = useState("");
  const duration = useReviewClock(`${selected}:${saved?.card?.reps}`);
  const unparsed = result?.words.length === 0;
  const word: LookupWord | undefined =
    result?.words.find((w) => w.id === selected) ||
    (unparsed && settings.studyLanguage
      ? {
          id: wordId(
            settings.studyLanguage,
            folded(term.trim(), settings.studyLanguage),
            "",
          ),
          lemma: folded(term.trim(), settings.studyLanguage),
          reading: "",
          language: settings.studyLanguage,
          meanings: [],
          forms: [],
        }
      : undefined);
  const hasPersonalDefinition =
    word?.meanings.some((meaning) => meaning.dictionaryId === "personal") ||
    false;
  useEffect(() => {
    if (!word) return;
    const root = document.querySelector<HTMLElement>(".lookup-reading")!;
    const content = document.querySelector<HTMLElement>(".lookup-content")!;
    if (page.selected === selected && page.openDetails)
      [...root.querySelectorAll("details")].forEach((details, index) => {
        details.open = page.openDetails!.includes(index);
      });
    content.scrollTop = page.scroll || 0;
    const ctx = new ContentScriptContext("popup-reader");
    startReader(ctx, {
      root,
      source: {
        url: word.meanings[0]?.sourceUrl || location.href,
        title: word.meanings[0]?.title || document.title,
      },
      onLookup: (term, context) =>
        onLookup(
          term,
          context,
          selected,
          content.scrollTop,
          [...root.querySelectorAll("details")].flatMap((details, index) =>
            details.open ? [index] : [],
          ),
        ),
    });
    return () => ctx.abort();
  }, [word?.id]);
  useEffect(() => {
    const session = new URLSearchParams(location.search).get("session");
    if (!session) return;
    const body = document.querySelector<HTMLElement>(".lookup-body")!;
    const resize = () => {
      const actions = document.querySelector<HTMLElement>(".lookup-actions");
      void lookupClient({
        action: "resizeLookup",
        session,
        height: Math.min(
          460,
          Math.ceil(
            body.getBoundingClientRect().height +
              (actions?.offsetHeight || 0) +
              20,
          ),
        ),
      }).catch(console.warn);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(body);
    const actions = document.querySelector(".lookup-actions");
    if (actions) observer.observe(actions);
    resize();
    return () => observer.disconnect();
  }, [word?.id]);
  useEffect(() => {
    let alive = true;
    void dictionariesClient({ action: "lookup", term })
      .then((lookup) => {
        if (!alive) return;
        setResult(lookup);
        setError(lookup.warning || "");
        setSelected(
          lookup.words.some((word) => word.id === page.selected)
            ? page.selected!
            : lookup.words[0]?.id || "",
        );
      })
      .catch((error) => setError(error.message));
    return () => {
      alive = false;
    };
  }, [term]);
  const reload = useCallback(() => {
    if (!selected || !term) return;
    void Promise.all([
      vocabularyClient({ action: "word", id: selected }),
      srsClient({ action: "preview", id: selected, durationMs: duration() }),
      settingsClient({ action: "settings" }),
      dictionariesClient({ action: "lookup", term }),
    ])
      .then(([word, times, settings, result]) => {
        setSaved(word);
        setTimes(times);
        setSettings(settings);
        setResult(result);
        setError(result.warning || "");
      })
      .catch((error) => setError(error.message));
  }, [selected, term, duration]);
  useEffect(reload, [reload]);
  useChanges(reload, ["vocabulary", "srs", "settings", "dictionaries"]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (
        candidateOpen ||
        (event.target as HTMLElement).closest('[role="menu"]')
      )
        return;
      if (event.key === "Escape") {
        if (onBack) onBack();
        else void lookupClient({ action: "closeLookup" });
        return;
      }
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (event.target as HTMLElement).tagName,
        )
      )
        return;
      const rating = Number(event.key);
      if (
        rating >= 1 &&
        rating <= 4 &&
        !unparsed &&
        !busy &&
        !saved?.known &&
        (!settings.onlyAgainGood || rating === 1 || rating === 3)
      ) {
        event.preventDefault();
        void act(rating);
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  async function ignoreTag(tag: string) {
    try {
      const latest = await settingsClient({ action: "settings" });
      setSettings(
        await settingsClient({
          action: "setSettings",
          value: { ...latest, ignoredTags: [...latest.ignoredTags, tag] },
        }),
      );
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function act(rating?: number) {
    if (!word) return;
    setBusy(true);
    setError("");
    try {
      if (rating) {
        const result = await srsClient({
          action: "grade",
          id: word.id,
          term,
          rating,
          version: saved?.srsVersion ?? 0,
          durationMs: duration(),
          time: Date.now(),
          source: "reading",
          context,
        });
        setSaved(result.word);
        setLastReview(result.reviewId);
        setNotice(
          t("reviewed", {
            value1: [t("again"), t("hard"), t("good"), t("easy")][rating - 1],
          }),
        );
      } else {
        setSaved(
          await vocabularyClient({
            action: "mine",
            id: word.id,
            term,
            context,
          }),
        );
        setNotice("");
      }
      reload();
    } catch (error) {
      setError((error as Error).message);
      reload();
    } finally {
      setBusy(false);
    }
  }
  async function toggleMastery() {
    if (!word) return;
    setBusy(true);
    setError("");
    try {
      setSaved(
        await vocabularyClient({
          action: "known",
          id: word.id,
          term,
          value: !saved?.known,
        }),
      );
      setLastReview("");
      setNotice("");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function definitionSaved(saved: Vocabulary) {
    setResult(await dictionariesClient({ action: "lookup", term }));
    setSelected(saved.id);
    setSaved(saved);
    setEditing(false);
    setNotice("");
  }
  async function deleteDefinition() {
    if (!word || !hasPersonalDefinition || busy) return;
    setBusy(true);
    setError("");
    try {
      await vocabularyClient({ action: "deleteDefinition", id: word.id });
      setEditing(false);
      setNotice("");
      reload();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return {
    settings,
    result,
    term,
    context,
    selected,
    setSelected,
    candidateOpen,
    setCandidateOpen,
    editing,
    setEditing,
    saved,
    times,
    error,
    setError,
    busy,
    notice,
    setNotice,
    lastReview,
    setLastReview,
    unparsed,
    word,
    hasPersonalDefinition,
    reload,
    ignoreTag,
    act,
    toggleMastery,
    definitionSaved,
    deleteDefinition,
  };
}
