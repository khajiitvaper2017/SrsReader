import type { Occurrence, OccurrenceGrammar } from "@/languages/analysis";
import { dictionariesClient } from "@/dictionaries/client";
import type { LookupResult, LookupWord } from "@/dictionaries/model";
import { wordMatchesGrammar } from "@/dictionaries/grammar";
import { parseNumeral } from "@/languages/numerals";
import { useDictionaryVisibility } from "@/vocabulary/hooks/useDictionaryVisibility";
import type { DefinitionEditing } from "@/vocabulary/components/EditableMeanings";
import {
  folded,
  hasGermanSuspensionHyphen,
  joinedGermanCompound,
} from "@/languages/text";
import { lookupClient } from "@/lookup/client";
import type { LookupPage } from "@/lookup/model";
import { readerClient } from "@/reader/client";
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
  personalWordLemma,
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
    next: LookupPage,
    previous: Pick<
      LookupPage,
      "selected" | "scroll" | "openDetails" | "definitionDraft"
    >,
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
  const definitionDraft = useRef(page.definitionDraft);
  const [result, setResult] = useState<LookupResult>();
  const [compoundAnalysis, setCompoundAnalysis] = useState<OccurrenceGrammar>();
  const compoundOccurrence =
    page.compound?.occurrence ?? page.compoundSource?.occurrence;
  const compoundSurface =
    page.compound?.context.surface ?? page.compoundSource?.surface;
  useEffect(() => {
    let active = true;
    if (compoundOccurrence && compoundSurface)
      void lookupClient({
        action: "compoundGrammar",
        occurrence: compoundOccurrence,
        surface: compoundSurface,
      })
        .then((grammar) => {
          if (active) setCompoundAnalysis(grammar);
        })
        .catch(console.warn);
    return () => {
      active = false;
    };
  }, [compoundOccurrence, compoundSurface]);
  const [refined, setRefined] = useState<{
    page: LookupPage;
    term: string;
    context: ReadingContext;
    occurrence: Occurrence;
  }>();
  const { term, context, occurrence } = refined?.page === page ? refined : page;
  const [selected, setSelected] = useState(page.selected || "");
  const chosen = useRef(page.selected);
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [editing, setEditing] = useState<DefinitionEditing>(null);
  const selectionKey = JSON.stringify([selected, term, context, occurrence]);
  const [loadedSaved, setSaved] = useState<WordWithCards>();
  const [savedKey, setSavedKey] = useState("");
  const saved =
    savedKey === selectionKey && loadedSaved?.id === selected
      ? loadedSaved
      : undefined;
  const [preview, setPreview] = useState<{ id: string; times: number[] }>();
  const times = preview?.id === selectionKey ? preview.times : [];
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
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
  const duration = useReviewClock(`${selectionKey}:${saved?.card?.reps}`);
  const noResults = result?.words.length === 0;
  const candidates =
    result?.words.filter(
      (candidate) =>
        candidate.id === selected ||
        wordMatchesGrammar(candidate, result.grammar, expandedDictionaries),
    ) || [];
  const fallbackLemma = personalWordLemma(term, settings.studyLanguage);
  const word: LookupWord | undefined =
    result?.words.find((w) => w.id === selected) ||
    (noResults && settings.studyLanguage
      ? {
          id: wordId(settings.studyLanguage, fallbackLemma, ""),
          lemma: fallbackLemma,
          reading: "",
          language: settings.studyLanguage,
          meanings: [],
          forms: [],
        }
      : undefined);
  const unparsed =
    !!word && !word.meanings.length && !saved?.linkedCards.length;
  const sourceCompound = context?.surface;
  const markedTerm = sourceCompound ?? term;
  const joined =
    settings.studyLanguage === "de"
      ? joinedGermanCompound(page.context?.surface ?? page.term)
      : undefined;
  const matchedMarkedCompound =
    !!joined && !!word && folded(word.lemma, "de") === folded(joined, "de");
  const compoundTerm =
    (matchedMarkedCompound && markedTerm) ||
    (page.showCompoundParts &&
      sourceCompound &&
      !hasGermanSuspensionHyphen(sourceCompound) &&
      sourceCompound) ||
    word?.lemma ||
    term;
  const showCompoundParts =
    unparsed || page.showCompoundParts || matchedMarkedCompound;
  const [compoundParts, setCompoundParts] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    setCompoundParts([]);
    if (showCompoundParts && settings.studyLanguage === "de") {
      void dictionariesClient({
        action: "germanCompoundParts",
        term: compoundTerm,
      })
        .then((parts) => {
          if (alive) setCompoundParts(parts);
        })
        .catch(console.warn);
    }
    return () => {
      alive = false;
    };
  }, [compoundTerm, showCompoundParts, settings.studyLanguage]);
  function openLookup(next: LookupPage) {
    onLookup(next, {
      selected,
      scroll: contentRef.current?.scrollTop ?? 0,
      openDetails: [
        ...(readingRef.current?.querySelectorAll("details") ?? []),
      ].flatMap((details, index) => (details.open ? [index] : [])),
      definitionDraft: definitionDraft.current,
    });
  }
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
      onLookup: openLookup,
    });
    return () => ctx.abort();
  }, [word?.id]);
  useEffect(() => {
    let alive = true;
    const show = (lookup: LookupResult, contextual = false) => {
      if (!alive) return;
      setResult(lookup);
      setError(lookup.warning || "");
      setSelected(
        (current) =>
          (
            lookup.words.find(
              (word) =>
                word.id ===
                (chosen.current ?? (contextual ? undefined : current)),
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
        term: page.term,
        occurrence: page.occurrence,
      };
      const local = await dictionariesClient({ ...request, localOnly: true });
      if (!alive) return;
      if (local.numeral || local.words.length || !local.onlinePending)
        show(local);
      let contextualShown = false;
      const context = page.context;
      if (
        page.refineContext &&
        !page.occurrence &&
        context &&
        (!joined ||
          !local.words.some(
            (word) => folded(word.lemma, "de") === folded(joined, "de"),
          ))
      ) {
        void (async () => {
          const {
            results: [parsed],
          } = await readerClient({
            action: "scan",
            lookup: true,
            session: crypto.randomUUID(),
            language: request.language,
            texts: [context.sentence],
          });
          if (!alive) return;
          const numeric =
            local.numeral || parseNumeral(page.term, request.language);
          const span = parsed?.spans.find(
            (span) =>
              span.occurrence &&
              (numeric
                ? span.start === context.start &&
                  span.end === context.end &&
                  span.term === page.term &&
                  context.surface === page.term
                : span.start <= context.start && span.end >= context.end),
          );
          if (!span?.occurrence) return;
          const contextual = await dictionariesClient({
            ...request,
            term: span.term,
            occurrence: span.occurrence,
          });
          if (!alive || (!contextual.numeral && !contextual.words.length))
            return;
          contextualShown = true;
          setRefined({
            page,
            term: span.term,
            context: {
              ...context,
              surface: span.term,
              start: span.start,
              end: span.end,
            },
            occurrence: span.occurrence,
          });
          show(contextual, true);
        })().catch((error) =>
          console.warn("SrsReader: sentence lookup failed", error),
        );
      }
      if (local.onlinePending) {
        try {
          const online = await dictionariesClient(request);
          if (!contextualShown) show(online);
        } catch (error) {
          if (alive && !contextualShown && !local.words.length)
            setError((error as Error).message);
        }
      }
    })().catch((error) => {
      if (alive) setError(error.message);
    });
    return () => {
      alive = false;
    };
  }, [page, settings.studyLanguage, joined]);
  const definitionRefresh = useRef(0);
  useEffect(() => {
    return () => {
      definitionRefresh.current++;
    };
  }, [page, term, occurrence, settings.studyLanguage]);
  const refreshDefinitions = useCallback(() => {
    const request = ++definitionRefresh.current;
    void dictionariesClient({
      action: "lookup",
      language: settings.studyLanguage,
      term,
      occurrence,
    })
      .then((value) => {
        if (request !== definitionRefresh.current) return;
        setResult(value);
        setError(value.warning || "");
      })
      .catch((error) => {
        if (request === definitionRefresh.current) setError(error.message);
      });
  }, [page, settings.studyLanguage, term, occurrence]);
  useChanges(refreshDefinitions, ["dictionaries", "settings", "vocabulary"]);
  const pending = useRef(0);
  const reload = useCallback(() => {
    const request = ++pending.current;
    setPreview(undefined);
    if (!selected || !term) return;
    void vocabularyClient({
      action: "word",
      id: selected,
      context,
      occurrence,
    })
      .then(async (word) => {
        if (request !== pending.current) return;
        const times = await srsClient({
          action: "preview",
          id: selected,
          context,
          occurrence,
          cardId: word?.cardId,
          version: word?.srsVersion ?? 0,
          durationMs: duration(),
        });
        if (request !== pending.current) return;
        setSaved(word);
        setSavedKey(selectionKey);
        setPreview({ id: selectionKey, times });
      })
      .catch((error) => {
        if (request === pending.current) setError(error.message);
      });
  }, [selected, term, context, occurrence, selectionKey, duration]);
  useEffect(() => {
    reload();
    return () => {
      pending.current++;
    };
  }, [reload]);
  useChanges(reload, ["vocabulary", "srs", "settings", "dictionaries"]);
  useEffect(() => {
    setReviewed(false);
    setLastReview("");
    setNotice("");
  }, [selectionKey]);
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
    preview?.id === selectionKey &&
    !candidateOpen &&
    !unparsed &&
    !busy &&
    !saved?.known &&
    !saved?.suspended &&
    !saved?.linkedCards.find((card) => card.id === saved.cardId)?.suspended &&
    (!saved?.linkedCards.length || !!saved.cardId || !!context) &&
    !reviewed;
  useReviewControls({
    settings,
    mouseCapture: false,
    onGrade: canGrade ? (rating) => void act(rating) : undefined,
    onFlip: canGrade ? () => void act(3) : undefined,
    onUndo:
      lastReview && !candidateOpen && !busy ? () => void undo() : undefined,
  });
  async function undo() {
    if (busyRef.current || !lastReview) return;
    busyRef.current = true;
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
      busyRef.current = false;
    }
  }
  async function ignoreTag(tag: string) {
    try {
      const latest = await settingsClient({ action: "settings" });
      setSettings(
        await settingsClient({
          action: "setSettings",
          value: { ignoredTags: [...latest.ignoredTags, tag] },
        }),
      );
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function act(rating?: number) {
    if (
      !word ||
      busyRef.current ||
      preview?.id !== selectionKey ||
      (rating && reviewed)
    )
      return;
    busyRef.current = true;
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
        setSaved(
          await vocabularyClient({
            action: "word",
            id: word.id,
            context,
            occurrence,
          }),
        );
        setSavedKey(selectionKey);
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
        setSavedKey(selectionKey);
        setNotice("");
      }
      reload();
    } catch (error) {
      setError((error as Error).message);
      reload();
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  async function forget() {
    if (
      !saved ||
      (context && !saved.cardId) ||
      busyRef.current ||
      !confirm(
        t(
          context
            ? "delete_contextual_card_confirm"
            : "delete_word_and_recording_confirm",
          { lemma: saved.lemma },
        ),
      )
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await vocabularyClient({
        action: "deleteWord",
        id: saved.id,
        ...(context ? { cardId: saved.cardId } : {}),
      });
      setSaved(undefined);
      setLastReview("");
      setReviewed(false);
      setNotice("");
      reload();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  async function toggleMastery() {
    if (!word || busyRef.current || preview?.id !== selectionKey) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await vocabularyClient({
        action: "known",
        id: word.id,
        term,
        occurrence,
        value: !saved?.known,
      });
      reload();
      setLastReview("");
      setNotice("");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      busyRef.current = false;
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
      setSaved(
        await vocabularyClient({
          action: "word",
          id: saved.id,
          context,
          occurrence,
        }),
      );
      setSavedKey(selectionKey);
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
    setSelected: (id: string) => {
      chosen.current = id;
      setSelected(id);
    },
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
    busy: busy || preview?.id !== selectionKey,
    notice,
    setNotice,
    lastReview,
    reviewed,
    setLastReview,
    unparsed,
    compoundParts,
    compoundAnalysis,
    compoundSource:
      compoundOccurrence && compoundSurface
        ? { occurrence: compoundOccurrence, surface: compoundSurface }
        : undefined,
    definitionDraft,
    openLookup,
    word,
    reload,
    ignoreTag,
    act,
    forget,
    undo,
    toggleMastery,
    definitionSaved,
  };
}
