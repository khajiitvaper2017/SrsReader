import { usePronunciation } from "@/audio/hooks/usePronunciation";
import { stopAudio } from "@/audio/playback";
import type { Settings } from "@/settings/model";
import { useChanges } from "@/shared/hooks/useChanges";
import { srsClient } from "@/srs/client";
import type { Request, Responses } from "@/srs/contracts";
import { useReviewClock } from "@/srs/hooks/useReviewClock";
import { useReviewControls } from "@/srs/hooks/useReviewControls";
import { useReviewPreload } from "@/srs/hooks/useReviewPreload";
import { studyDay } from "@/srs/study-day";
import { startReader } from "@/reader/controller";
import { useCallback, useEffect, useRef, useState } from "react";
import { ContentScriptContext } from "wxt/utils/content-script-context";

export type SessionAnswer = {
  id: string;
  rating: number;
  introduced: boolean;
  recall: boolean;
  durationMs: number;
};

export function useReviewSession({
  settings,
  deckId,
}: {
  settings: Settings;
  deckId?: string;
}) {
  const [queue, setQueue] = useState<Responses["queue"]>();
  const [answers, setAnswers] = useState<SessionAnswer[]>([]);
  const limits =
    useRef<Extract<Request, { action: "queue" }>["limits"]>(undefined);
  const [revealed, setRevealed] = useState(false);
  const [times, setTimes] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const queueRevision = useRef(0);
  const [last, setLast] = useState(sessionStorage.getItem("last-review") || "");
  const [example, setExample] = useState(0);
  const readingRef = useRef<HTMLDivElement>(null);
  const word = queue?.words[0];
  useEffect(() => {
    if (!word) return;
    const ctx = new ContentScriptContext("review-reader");
    startReader(ctx, {
      root: readingRef.current!,
      scope: "extensionPages",
      settings,
      language: word.language,
    });
    return () => ctx.abort();
  }, [word?.id, word?.card?.reps, settings]);
  const preload = useReviewPreload(settings, queue);
  const { play: playAudio } = usePronunciation({
    word,
    settings,
    onError: setError,
    prepareRecording: preload.loadAudio,
  });
  const [sentences, setSentences] = useState<{
    id: string;
    contexts: Responses["sentenceExamples"];
    loading: boolean;
  }>({ id: "", contexts: [], loading: false });
  const contexts = sentences.id === word?.id ? sentences.contexts : [];
  const sentenceLoading =
    !!word && (sentences.id !== word.id || sentences.loading);
  const context = contexts[example];
  const [sentenceRevision, refreshSentences] = useState(0);
  const sentencesChanged = useCallback(
    () => refreshSentences((value) => value + 1),
    [],
  );
  useChanges(sentencesChanged, ["vocabulary"]);
  useEffect(() => {
    let alive = true;
    setSentences({ id: word?.id || "", contexts: [], loading: !!word });
    if (word)
      void preload
        .loadSentences(word.id)
        .then((value) => {
          if (alive) {
            setSentences({ id: word.id, contexts: value, loading: false });
          }
        })
        .catch((error) => {
          if (alive) {
            setSentences({ id: word.id, contexts: [], loading: false });
            setError(error.message);
          }
        });
    return () => {
      alive = false;
    };
  }, [word?.id, word?.version, settings, sentenceRevision, preload]);
  const duration = useReviewClock(`${word?.id}:${word?.card?.reps}`);
  const fetchQueue = useCallback(
    () =>
      srsClient({
        action: "queue",
        language: settings.studyLanguage,
        deckId,
        limits: limits.current,
      }),
    [deckId, settings.studyLanguage],
  );
  const loadQueue = useCallback(
    (preserveCurrent: boolean) => {
      if (busyRef.current) return;
      const revision = preserveCurrent
        ? queueRevision.current
        : ++queueRevision.current;
      void fetchQueue()
        .then((value) => {
          if (revision !== queueRevision.current) return;
          setQueue((current) => {
            const word = current?.words[0];
            return preserveCurrent && word
              ? {
                  ...value,
                  words: [
                    word,
                    ...value.words.filter((next) => next.id !== word.id),
                  ],
                }
              : value;
          });
        })
        .catch((error) => {
          if (revision === queueRevision.current) setError(error.message);
        });
    },
    [fetchQueue],
  );
  const load = useCallback(() => loadQueue(false), [loadQueue]);
  const refresh = useCallback(() => loadQueue(true), [loadQueue]);
  useEffect(() => {
    load();
    return () => {
      queueRevision.current++;
    };
  }, [load]);
  useChanges(refresh, [
    "vocabulary",
    "srs",
    "settings",
    "dictionaries",
    "frequency",
    "collection",
  ]);
  useEffect(() => {
    setRevealed(false);
    setExample(0);
    stopAudio();
  }, [word?.id, word?.card?.reps]);
  useEffect(() => {
    if (!word) return;
    let alive = true;
    setTimes([]);
    void srsClient({ action: "preview", id: word.id, durationMs: duration() })
      .then((value) => {
        if (alive) setTimes(value);
      })
      .catch((error) => {
        if (alive) setError(error.message);
      });
    return () => {
      alive = false;
    };
  }, [word?.id, word?.srsVersion, settings, revealed, duration]);
  useEffect(() => {
    if (!queue?.wakeAt) return;
    const timer = setTimeout(
      refresh,
      Math.min(Math.max(500, queue.wakeAt - Date.now() + 50), 60000),
    );
    return () => clearTimeout(timer);
  }, [queue, refresh]);
  async function gradeWord(rating: number) {
    if (!word || !revealed || busyRef.current) return;
    busyRef.current = true;
    const revision = ++queueRevision.current;
    setBusy(true);
    setError("");
    stopAudio();
    try {
      const durationMs = duration();
      const time = Date.now();
      const result = await srsClient({
        action: "grade",
        id: word.id,
        term: word.lemma,
        rating,
        version: word.srsVersion,
        source: "review",
        durationMs,
        time,
      });
      const card = word.card!;
      setAnswers((answers) => [
        ...answers,
        {
          id: result.reviewId,
          rating,
          introduced: card.state === 0,
          recall:
            card.state === 2 ||
            (card.last_review !== null &&
              studyDay(card.last_review, settings.rolloverHour) <
                studyDay(time, settings.rolloverHour)),
          durationMs,
        },
      ]);
      setLast(result.reviewId);
      sessionStorage.setItem("last-review", result.reviewId);
      setQueue(
        (current) =>
          current && {
            ...current,
            words: current.words.filter((entry) => entry.id !== word.id),
          },
      );
      setRevealed(false);
      await fetchQueue()
        .then((value) => {
          if (revision === queueRevision.current) setQueue(value);
        })
        .catch((error) => {
          if (revision === queueRevision.current) setError(error.message);
        });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function reveal() {
    setRevealed(true);
    if (settings.autoplay && word) void playAudio();
  }
  useReviewControls({
    settings,
    onGrade:
      word && revealed && !busy
        ? (rating) => void gradeWord(rating)
        : undefined,
    onFlip:
      word && !busy
        ? () => {
            if (revealed) void gradeWord(3);
            else reveal();
          }
        : undefined,
    onUndo: last && !busy ? () => void undo() : undefined,
  });
  async function undo() {
    if (busyRef.current || !last) return;
    busyRef.current = true;
    const revision = ++queueRevision.current;
    setBusy(true);
    setError("");
    try {
      await srsClient({ action: "undo", id: last });
      setAnswers((answers) => answers.filter((answer) => answer.id !== last));
      setLast("");
      sessionStorage.removeItem("last-review");
      const value = await fetchQueue();
      if (revision === queueRevision.current) setQueue(value);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function studyMore() {
    if (busyRef.current || !queue) return;
    busyRef.current = true;
    const revision = ++queueRevision.current;
    setBusy(true);
    setError("");
    const before = limits.current;
    limits.current = {
      newLimit: queue.limits.newLimit + 10,
      reviewLimit:
        queue.limits.reviewLimit === null
          ? null
          : queue.limits.reviewLimit + 50,
    };
    try {
      const value = await fetchQueue();
      if (revision === queueRevision.current) setQueue(value);
    } catch (error) {
      limits.current = before;
      setError((error as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return {
    readingRef,
    answers,
    studyMore,
    preload,
    queue,
    revealed,
    times,
    error,
    setError,
    busy,
    last,
    example,
    setExample,
    word,
    context,
    contexts,
    sentenceLoading,
    load,
    gradeWord,
    reveal,
    undo,
  };
}
