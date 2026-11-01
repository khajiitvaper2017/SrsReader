import type { Occurrence } from "@/languages/analysis";
import { dictionariesClient } from "@/dictionaries/client";
import type { LookupResult, LookupWord } from "@/dictionaries/model";
import { wordMatchesGrammar } from "@/dictionaries/grammar";
import { useDictionaryVisibility } from "@/vocabulary/hooks/useDictionaryVisibility";
import type { DefinitionEditing } from "@/vocabulary/components/EditableMeanings";
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
import { useReviewControls } from "@/srs/hooks/useReviewControls";
import { vocabularyClient } from "@/vocabulary/client";
import {
  wordId,
  type ReadingContext,
  type WordWithCards,
  type Vocabulary,
} from "@/vocabulary/model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    occurrence?: Occurrence,
  ) => void;
  onBack?: () => void;
}) {
  const [preferences, setSettings] = useSettings();
  const settings = useMemo(
    () => ({
      ...preferences,
      studyLanguage:
        page.context?.language ||
        (page.selected
          ? JSON.parse(page.selected)[0]
          : preferences.studyLanguage),
    }),
    [preferences, page.context?.language, page.selected],
  );
  const readingRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<LookupResult>();
  const { term, context, occurrence } = page;
  const [selected, setSelected] = useState(page.selected || "");
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [editing, setEditing] = useState<DefinitionEditing>(null);
  const [saved, setSaved] = useState<WordWithCards>();
  const [times, setTimes] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const visibility = useDictionaryVisibility(
    selected,
    saved?.id === selected ? saved : undefined,
    setError,
  );
  const { expandedDictionaries, hiddenDictionaries, toggleHiddenDictionary } =
    visibility;
  const [notice, setNotice] = useState("");
  const [lastReview, setLastReview] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const duration = useReviewClock(`${selected}:${saved?.card?.reps}`);
  const noResults = result?.words.length === 0;
  const candidates =
    result?.words.filter(
      (candidate) =>
        candidate.id === selected ||
        wordMatchesGrammar(candidate, result.grammar, expandedDictionaries),
    ) || [];
  const word: LookupWord | undefined =
    result?.words.find((w) => w.id === selected) ||
    (noResults && settings.studyLanguage
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
  const unparsed =
    !!word && !word.meanings.length && !saved?.linkedCards.length;
  useEffect(() => {
    if (!word) return;
    const root = readingRef.current!;
    const content = contentRef.current!;
    if (page.selected === selected && page.openDetails)
      [...root.querySelectorAll("details")].forEach((details, index) => {
        details.open = page.openDetails!.includes(index);
      });
    content.scrollTop = page.scroll || 0;
    const ctx = new ContentScriptContext("popup-reader");
    startReader(ctx, {
      root,
      settings,
      language: word.language,
      source: {
        url: word.meanings[0]?.sourceUrl || location.href,
        title: word.meanings[0]?.title || document.title,
      },
      onLookup: (term, context, occurrence) =>
        onLookup(
          term,
          context,
          selected,
          content.scrollTop,
          [...root.querySelectorAll("details")].flatMap((details, index) =>
            details.open ? [index] : [],
          ),
          occurrence,
        ),
    });
    return () => ctx.abort();
  }, [word?.id]);
  useEffect(() => {
    let alive = true;
    const show = (lookup: LookupResult) => {
      if (!alive) return;
      setResult(lookup);
      setError(lookup.warning || "");
      setSelected(
        (current) =>
          (
            lookup.words.find(
              (word) => word.id === (current || page.selected),
            ) ||
            lookup.words.find((word) =>
              wordMatchesGrammar(word, lookup.grammar),
            ) ||
            lookup.words[0]
          )?.id || "",
      );
    };
    void (async () => {
      const request = {
        action: "lookup" as const,
        language: settings.studyLanguage,
        term,
        occurrence,
      };
      const local = await dictionariesClient({ ...request, localOnly: true });
      if (!alive) return;
      if (local.words.length || !local.onlinePending) show(local);
      if (local.onlinePending) show(await dictionariesClient(request));
    })().catch((error) => {
      if (alive) setError(error.message);
    });
    return () => {
      alive = false;
    };
  }, [term, occurrence, settings.studyLanguage]);
  const refreshDefinitions = useCallback(() => {
    void dictionariesClient({
      action: "lookup",
      language: settings.studyLanguage,
      term,
      occurrence,
    })
      .then((value) => {
        setResult(value);
        setError(value.warning || "");
      })
      .catch((error) => setError(error.message));
  }, [settings.studyLanguage, term, occurrence]);
  useChanges(refreshDefinitions, ["dictionaries", "settings", "vocabulary"]);
  const pending = useRef(0);
  const reload = useCallback(() => {
    const request = ++pending.current;
    if (!selected || !term) return;
    void Promise.all([
      vocabularyClient({ action: "word", id: selected }),
      srsClient({ action: "preview", id: selected, durationMs: duration() }),
    ])
      .then(([word, times]) => {
        if (request !== pending.current) return;
        setSaved(word);
        setTimes(times);
      })
      .catch((error) => {
        if (request === pending.current) setError(error.message);
      });
  }, [selected, term, duration, occurrence, settings.studyLanguage]);
  useEffect(() => {
    reload();
    return () => {
      pending.current++;
    };
  }, [reload]);
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
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  const canGrade =
    !!word &&
    !candidateOpen &&
    !unparsed &&
    !busy &&
    !saved?.known &&
    !saved?.suspended &&
    !saved?.linkedCards.find((card) => card.id === saved.cardId)?.suspended &&
    (!saved?.linkedCards.length || !!saved.cardId) &&
    !reviewed;
  useReviewControls({
    settings,
    onGrade: canGrade ? (rating) => void act(rating) : undefined,
    onFlip: canGrade ? () => void act(3) : undefined,
    onUndo:
      lastReview && !candidateOpen && !busy ? () => void undo() : undefined,
  });
  async function undo() {
    setBusy(true);
    try {
      await srsClient({ action: "undo", id: lastReview });
      setLastReview("");
      setReviewed(false);
      setNotice(t("review_undone"));
      reload();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
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
    if (!word || (rating && reviewed)) return;
    setBusy(true);
    setError("");
    try {
      if (rating) {
        const result = await srsClient({
          action: "grade",
          id: word.id,
          cardId: saved?.cardId,
          term,
          rating,
          version: saved?.srsVersion ?? 0,
          durationMs: duration(),
          time: Date.now(),
          source: "reading",
          context,
          occurrence,
        });
        setSaved(await vocabularyClient({ action: "word", id: word.id }));
        setLastReview(result.reviewId);
        setReviewed(true);
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
            occurrence,
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
          occurrence,
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
  async function definitionSaved(saved?: Vocabulary) {
    setResult(
      await dictionariesClient({
        action: "lookup",
        language: settings.studyLanguage,
        term,
        occurrence,
      }),
    );
    if (saved) {
      setSelected(saved.id);
      setSaved(await vocabularyClient({ action: "word", id: saved.id }));
    }
    setEditing(null);
    setNotice("");
  }
  function toggleDictionary(id: string) {
    const expanded = expandedDictionaries.includes(id)
      ? expandedDictionaries.filter((dictionary) => dictionary !== id)
      : [...expandedDictionaries, id];
    visibility.toggleDictionary(id);
    const current = result?.words.find(
      (candidate) => candidate.id === selected,
    );
    const next =
      current && wordMatchesGrammar(current, result?.grammar, expanded)
        ? current
        : result?.words.find((candidate) =>
            wordMatchesGrammar(candidate, result.grammar, expanded),
          );
    if (next) setSelected(next.id);
  }
  return {
    readingRef,
    contentRef,
    settings,
    result,
    term,
    context,
    selected,
    setSelected,
    candidateOpen,
    setCandidateOpen,
    candidates,
    expandedDictionaries,
    hiddenDictionaries,
    toggleHiddenDictionary,
    toggleDictionary,
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
    reviewed,
    setLastReview,
    unparsed,
    word,
    reload,
    ignoreTag,
    act,
    undo,
    toggleMastery,
    definitionSaved,
  };
}
