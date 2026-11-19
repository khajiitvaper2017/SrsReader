import {
  chooseCardAudio,
  getCardMedia,
  preferredCardAudio,
} from "@/media/storage";
import { audioClient } from "@/audio/client";
import type { AudioInfo } from "@/audio/model";
import { localVoices, playBlob, speak, stopAudio } from "@/audio/playback";
import { preparePronunciation } from "@/audio/prepare";
import type { LookupWord } from "@/dictionaries/model";
import { normalize } from "@/languages/text";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function usePronunciation({
  word,
  form,
  sentence,
  noteId,
  cardId,
  settings,
  onError,
  prepareRecording,
  recording,
}: {
  word?: Pick<LookupWord, "id" | "lemma" | "language">;
  /** Additional recording-search form and word TTS text, not a replacement word identity. */
  form?: string;
  sentence?: string;
  noteId?: string;
  cardId?: string;
  settings: Settings;
  onError: (message: string) => void;
  /** Reuse recordings prepared by the review session. */
  prepareRecording?: typeof preparePronunciation;
  recording?: Blob;
}) {
  const pronunciationForm = form ? normalize(form).trim() : undefined;
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<AudioInfo[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [discoveryError, setDiscoveryError] = useState("");
  const [active, setActive] = useState("");
  const [cardRecording, setCardRecording] = useState("");
  const hold = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const playback = useRef(0);
  const cancel = useCallback(() => {
    playback.current++;
    stopAudio();
    setBusy(false);
  }, []);
  const prepare = useMemo(() => {
    let pending: ReturnType<typeof preparePronunciation> | undefined;
    return (source?: AudioInfo) => {
      if (!word || sentence) return Promise.resolve(undefined);
      if (prepareRecording && !pronunciationForm)
        return prepareRecording(word.id, source);
      if (source) {
        pending = undefined;
        return preparePronunciation(word.id, source, pronunciationForm);
      }
      return (pending ??= preparePronunciation(
        word.id,
        undefined,
        pronunciationForm,
      ));
    };
  }, [
    word?.id,
    pronunciationForm,
    sentence,
    settings.audioSources,
    settings.audioDialects,
    prepareRecording,
  ]);
  useEffect(() => {
    setOpen(false);
    setSources([]);
    setActive("");
    setCardRecording("");
    setBusy(false);
    setLoading(false);
    return () => {
      clearTimeout(hold.current);
      playback.current++;
    };
  }, [word?.id, pronunciationForm, sentence, noteId, cardId, recording]);
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
      void getCardMedia(word.id, "wordAudio", "", noteId)
        .then((media) => {
          if (alive) setCardRecording(media?.name ?? "");
        })
        .catch((error: Error) => {
          if (alive) setDiscoveryError(error.message);
        });
      setLoading(true);
      void audioClient({
        action: "audio",
        id: word.id,
        download: false,
        form: pronunciationForm,
      })
        .then((cached) => {
          if (alive) setSources(cached ? [cached] : []);
          return audioClient({
            action: "audioSources",
            id: word.id,
            form: pronunciationForm,
          });
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
  }, [
    open,
    word?.id,
    word?.language,
    pronunciationForm,
    sentence,
    noteId,
    settings.audioSources,
    settings.audioDialects,
  ]);
  async function play(
    source?: AudioInfo | { voice: string } | "card",
    automatic = false,
  ) {
    if (!word && !recording) return;
    const attempt = ++playback.current;
    stopAudio();
    setBusy(true);
    if (!automatic) onError("");
    const playRecording = (blob: Blob) =>
      playBlob(blob, settings.normalizeAudio, automatic);
    try {
      if (!source && recording) {
        await playRecording(recording);
        return;
      }
      if (!word) return;
      const playVoice = (voice: string) =>
        speak(
          sentence || pronunciationForm || word.lemma,
          word.language,
          voice,
        );
      const remember = async (choice?: Blob | string) => {
        if (cardId && !sentence && attempt === playback.current)
          await chooseCardAudio(cardId, choice);
      };
      if (source && source !== "card" && "voice" in source) {
        setActive(`tts:${source.voice}`);
        await playVoice(source.voice);
        await remember(source.voice);
        return;
      }
      if (!source || source === "card") {
        if (!source && cardId && !sentence) {
          const preferred = await preferredCardAudio(cardId);
          if (attempt !== playback.current) return;
          if (preferred) {
            if ("voice" in preferred) await playVoice(preferred.voice);
            else await playRecording(preferred.blob);
            return;
          }
        }
        const media = await getCardMedia(
          word.id,
          sentence ? "audio" : "wordAudio",
          sentence,
          noteId,
        );
        if (attempt !== playback.current) return;
        if (media) {
          setActive(media.id);
          await playRecording(media.blob);
          if (source === "card") await remember();
          return;
        }
        if (source === "card") throw new Error(t("audio_source_unavailable"));
      }
      if (sentence) {
        setActive(`tts:${settings.voice}`);
        await playVoice(settings.voice);
        return;
      }
      if (source) {
        setActive(source.url);
        const record = await prepare(source);
        if (attempt !== playback.current) return;
        if (!record || record.url !== source.url)
          throw new Error(t("audio_source_unavailable"));
        await playRecording(record.blob);
        await remember(record.blob);
        return;
      }
      const record = await prepare();
      if (attempt !== playback.current) return;
      if (record) {
        try {
          setActive(record.url);
          await playRecording(record.blob);
          return;
        } catch {
          /* Try the installed voice if this browser cannot decode the recording. */
        }
      }
      if (attempt !== playback.current) return;
      setActive(`tts:${settings.voice}`);
      await playVoice(settings.voice);
    } catch (error) {
      if (!automatic && attempt === playback.current)
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
    cardRecording,
    hold,
    held,
    play,
    cancel,
    label,
  };
}
