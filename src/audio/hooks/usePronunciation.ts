import { audioClient } from "@/audio/client";
import type { AudioInfo } from "@/audio/model";
import { localVoices, playBlob, speak, stopAudio } from "@/audio/playback";
import { preparePronunciation } from "@/audio/prepare";
import type { LookupWord } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { useEffect, useMemo, useRef, useState } from "react";

export function usePronunciation({
  word,
  sentence,
  settings,
  onError,
  prepareRecording,
}: {
  word?: Pick<LookupWord, "id" | "lemma" | "language">;
  sentence?: string;
  settings: Settings;
  onError: (message: string) => void;
  /** Reuse recordings prepared by the review session. */
  prepareRecording?: typeof preparePronunciation;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<AudioInfo[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [discoveryError, setDiscoveryError] = useState("");
  const [active, setActive] = useState("");
  const hold = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const playback = useRef(0);
  const prepare = useMemo(() => {
    let pending: ReturnType<typeof preparePronunciation> | undefined;
    return (source?: AudioInfo) => {
      if (!word || sentence) return Promise.resolve(undefined);
      if (prepareRecording) return prepareRecording(word.id, source);
      if (source) {
        pending = undefined;
        return preparePronunciation(word.id, source);
      }
      return (pending ??= preparePronunciation(word.id));
    };
  }, [word?.id, sentence, settings.audioSources, prepareRecording]);
  useEffect(() => {
    setOpen(false);
    setSources([]);
    setActive("");
    return () => {
      clearTimeout(hold.current);
      playback.current++;
    };
  }, [word?.id, sentence]);
  useEffect(() => {
    if (!open || !word) return;
    let alive = true;
    setDiscoveryError("");
    void localVoices().then((voices) => {
      if (alive)
        setVoices(
          voices.filter((voice) => voice.lang.split("-")[0] === word.language),
        );
    });
    if (!sentence) {
      setLoading(true);
      void audioClient({ action: "audio", id: word.id, download: false })
        .then((cached) => {
          if (alive) setSources(cached ? [cached] : []);
          return audioClient({ action: "audioSources", id: word.id });
        })
        .then((found) => {
          if (alive)
            setSources((cached) => [
              ...found,
              ...cached.filter(
                (source) => !found.some((item) => item.url === source.url),
              ),
            ]);
        })
        .catch((error) => {
          if (alive) setDiscoveryError(error.message);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }
    return () => {
      alive = false;
    };
  }, [open, word?.id, word?.language, sentence, settings.audioSources]);
  function playVoice(voice: string) {
    if (!word) return;
    void speak(sentence || word.lemma, word.language, voice).catch((error) =>
      onError(error instanceof Error ? error.message : String(error)),
    );
  }
  async function play(source?: AudioInfo | { voice: string }) {
    if (!word) return;
    const attempt = ++playback.current;
    stopAudio();
    setBusy(true);
    onError("");
    try {
      if (source && "voice" in source) {
        setActive(`tts:${source.voice}`);
        playVoice(source.voice);
        return;
      }
      if (sentence) {
        setActive(`tts:${settings.voice}`);
        playVoice(settings.voice);
        return;
      }
      if (source) {
        setActive(source.url);
        const record = await prepare(source);
        if (attempt !== playback.current) return;
        if (!record || record.url !== source.url)
          throw new Error(t("audio_source_unavailable"));
        await playBlob(record.blob, settings.normalizeAudio);
        return;
      }
      const record = await prepare();
      if (attempt !== playback.current) return;
      if (record) {
        try {
          setActive(record.url);
          await playBlob(record.blob, settings.normalizeAudio);
          return;
        } catch {
          /* Try the installed voice if this browser cannot decode the recording. */
        }
      }
      if (attempt !== playback.current) return;
      setActive(`tts:${settings.voice}`);
      playVoice(settings.voice);
    } catch (error) {
      if (attempt === playback.current)
        onError(error instanceof Error ? error.message : String(error));
    } finally {
      if (attempt === playback.current) setBusy(false);
    }
  }
  const label = sentence
    ? t("read_sentence_aloud")
    : t("play_word_pronunciation");
  return {
    busy,
    open,
    setOpen,
    loading,
    sources,
    voices,
    discoveryError,
    active,
    hold,
    held,
    play,
    label,
  };
}
