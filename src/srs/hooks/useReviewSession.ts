import { playBlob, speak, stopAudio } from "@/audio/playback";
import { getAudio } from "@/audio/storage";
import { rpc } from "@/platform/messaging/send";
import type { Settings } from "@/settings/model";
import { useChanges } from "@/shared/hooks/useChanges";
import { srsClient } from "@/srs/client";
import { useReviewClock } from "@/srs/hooks/useReviewClock";
import { useCallback, useEffect, useRef, useState } from "react";

export function useReviewSession({
  settings,
}: {
  settings: Settings;
  stats: { total: number; due: number; known: number; today: number };
}) {
  const [queue, setQueue] =
    useState<Awaited<ReturnType<typeof rpc<{ action: "queue" }>>>>();
  const [revealed, setRevealed] = useState(false);
  const [times, setTimes] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [last, setLast] = useState(sessionStorage.getItem("last-review") || "");
  const [front, setFront] = useState(settings.front);
  const [example, setExample] = useState(0);
  const word = queue?.words[0];
  const context = word?.contexts[example];
  const duration = useReviewClock(`${word?.id}:${word?.card?.reps}`);
  const load = useCallback(() => {
    if (busyRef.current) return;
    void srsClient({ action: "queue" })
      .then((value) => setQueue(value))
      .catch((error) => setError(error.message));
  }, []);
  useEffect(load, [load]);
  useChanges(load);
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
      setQueue(await srsClient({ action: "queue" }));
      setRevealed(false);
    } catch (error) {
      setError((error as Error).message);
      setQueue(await srsClient({ action: "queue" }));
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
    load,
    gradeWord,
    reveal,
    undo,
  };
}
