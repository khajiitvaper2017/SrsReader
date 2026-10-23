import { audioClient } from "@/audio/client";
import type { AudioInfo } from "@/audio/model";
import { localVoices, playBlob, speak, stopAudio } from "@/audio/playback";
import { getAudio } from "@/audio/storage";
import type { LookupWord } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { useEffect, useRef, useState } from "react";

export function usePronunciation({
  word,
  sentence,
  settings,
  onError,
}: {
  word?: Pick<LookupWord, "id" | "lemma" | "language">;
  sentence?: string;
  settings: Settings;
  onError: (message: string) => void;
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
        await audioClient({
          action: "audio",
          id: word.id,
          download: true,
          source,
        });
        const record = await getAudio(word.id);
        if (attempt !== playback.current) return;
        if (!record || record.url !== source.url)
          throw new Error(t("audio_source_unavailable"));
        await playBlob(record.blob, settings.normalizeAudio);
        return;
      }
      let record = await getAudio(word.id);
      if (!record && settings.audioDownloads) {
        try {
          await audioClient({ action: "audio", id: word.id, download: true });
          record = await getAudio(word.id);
        } catch {
          /* The system voice remains available when the recording service is offline. */
        }
      }
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
