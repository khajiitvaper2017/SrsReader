import { playBlob, speak, stopAudio } from "@/audio/playback";
import { getAudio } from "@/audio/storage";
import type { Settings } from "@/settings/model";
import { useChanges } from "@/shared/hooks/useChanges";
import { srsClient } from "@/srs/client";
import type { Responses } from "@/srs/contracts";
import type { ReadingContext } from "@/vocabulary/model";
import { useReviewClock } from "@/srs/hooks/useReviewClock";
import { useCallback, useEffect, useRef, useState } from "react";

export function useReviewSession({
  settings,
  deckId,
}: {
  settings: Settings;
  deckId?: string;
}) {
  const [queue, setQueue] = useState<Responses["queue"]>();
  const [revealed, setRevealed] = useState(false);
  const [times, setTimes] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [last, setLast] = useState(sessionStorage.getItem("last-review") || "");
  const [front, setFront] = useState(settings.front);
  const [example, setExample] = useState(0);
  const word = queue?.words[0];
  const [sentences, setSentences] = useState<{
    id: string;
    contexts: ReadingContext[];
    loading: boolean;
  }>({ id: "", contexts: [], loading: false });
  const contexts = sentences.id === word?.id ? sentences.contexts : [];
  const sentenceLoading =
    !!word && (sentences.id !== word.id || sentences.loading);
  const context = contexts[example];
  useEffect(() => {
    let alive = true;
    setSentences({ id: word?.id || "", contexts: [], loading: !!word });
    if (word)
      void srsClient({ action: "sentenceExamples", id: word.id })
        .then((value) => {
          if (alive)
            setSentences({ id: word.id, contexts: value, loading: false });
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
  }, [word?.id, settings.nativeLanguage]);
  const duration = useReviewClock(`${word?.id}:${word?.card?.reps}`);
  const load = useCallback(() => {
    if (busyRef.current) return;
    void srsClient({ action: "queue", deckId })
      .then((value) => setQueue(value))
      .catch((error) => setError(error.message));
  }, [deckId]);
  useEffect(load, [load]);
  useChanges(load, ["vocabulary", "srs", "settings", "dictionaries"]);
  useEffect(() => {
    setFront(settings.front);
  }, [settings.front]);
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
      load,
      Math.min(Math.max(500, queue.wakeAt - Date.now() + 50), 60000),
    );
    return () => clearTimeout(timer);
  }, [queue, load]);
  async function gradeWord(rating: number) {
    if (!word || !revealed || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    stopAudio();
    try {
      const result = await srsClient({
        action: "grade",
        id: word.id,
        term: word.lemma,
        rating,
        version: word.srsVersion,
        source: "review",
        durationMs: duration(),
        time: Date.now(),
      });
      setLast(result.reviewId);
      sessionStorage.setItem("last-review", result.reviewId);
      setQueue(await srsClient({ action: "queue", deckId }));
      setRevealed(false);
    } catch (error) {
      setError((error as Error).message);
      setQueue(await srsClient({ action: "queue", deckId }));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function reveal() {
    setRevealed(true);
    if (settings.autoplay && word)
      void (async () => {
        const recording = await getAudio(word.id);
        if (recording) await playBlob(recording.blob, settings.normalizeAudio);
        else await speak(word.lemma, word.language, settings.voice);
      })().catch((error) => setError(error.message));
  }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if ((event.target as HTMLElement).closest('[role="menu"]')) return;
      if (
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(
          (event.target as HTMLElement).tagName,
        ) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (event.code === "Space" && word && !revealed) {
        event.preventDefault();
        reveal();
      }
      if (
        revealed &&
        /^[1-4]$/.test(event.key) &&
        (!settings.onlyAgainGood || event.key === "1" || event.key === "3")
      ) {
        event.preventDefault();
        void gradeWord(Number(event.key));
      }
    }
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  async function undo() {
    try {
      await srsClient({ action: "undo", id: last });
      setLast("");
      sessionStorage.removeItem("last-review");
      load();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return {
    queue,
    revealed,
    times,
    error,
    setError,
    busy,
    last,
    front,
    setFront,
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
