import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LoaderCircle, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { t } from "./i18n";
import { rpc } from "./api";
import { db } from "./db";
import { localVoices, playBlob, speak, stopAudio } from "./audio";
import type { AudioInfo, LookupWord, Settings } from "./model";

export function AudioButton({
  word,
  sentence,
  settings,
  onError,
}: {
  word: Pick<LookupWord, "id" | "lemma" | "language">;
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
  }, [word.id, sentence]);
  useEffect(() => {
    if (!open) return;
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
      void rpc({ action: "audio", id: word.id, download: false })
        .then((cached) => {
          if (alive) setSources(cached ? [cached] : []);
          return rpc({ action: "audioSources", id: word.id });
        })
        .then((found) => {
          if (alive)
            setSources((cached) => [
              ...cached,
              ...found.filter(
                (source) => !cached.some((item) => item.url === source.url),
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
  }, [open, word.id, word.language, sentence]);

  function playVoice(voice: string) {
    void speak(sentence || word.lemma, word.language, voice).catch((error) =>
      onError(error instanceof Error ? error.message : String(error)),
    );
  }
  async function play(source?: AudioInfo | { voice: string }) {
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
        await rpc({ action: "audio", id: word.id, download: true, source });
        const record = await db.audio.get(word.id);
        if (attempt !== playback.current) return;
        if (!record || record.url !== source.url)
          throw new Error(t("audio_source_unavailable"));
        await playBlob(record.blob, settings.normalizeAudio);
        return;
      }
      let record = await db.audio.get(word.id);
      if (!record && settings.audioDownloads) {
        try {
          await rpc({ action: "audio", id: word.id, download: true });
          record = await db.audio.get(word.id);
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
  return (
    <span className="audio-control" data-srs-reader="">
      <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenu.Trigger
          className={sentence ? "quiet" : "icon-button"}
          title={t("audio_button_hint", { action: label })}
          aria-label={label}
          aria-busy={busy}
          onPointerDown={(event) => {
            event.preventDefault();
            if (event.button !== 0) return;
            event.currentTarget.focus();
            held.current = false;
            hold.current = window.setTimeout(() => {
              held.current = true;
              setOpen(true);
            }, 500);
          }}
          onPointerUp={() => clearTimeout(hold.current)}
          onPointerCancel={() => clearTimeout(hold.current)}
          onPointerLeave={() => clearTimeout(hold.current)}
          onContextMenu={(event) => {
            event.preventDefault();
            clearTimeout(hold.current);
            held.current = true;
            setOpen(true);
          }}
          onClick={(event) => {
            event.preventDefault();
            if (held.current) {
              held.current = false;
              return;
            }
            if (event.shiftKey) setOpen(true);
            else void play();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              void play();
            }
          }}
        >
          {busy ? (
            <LoaderCircle className="spin" aria-hidden="true" />
          ) : (
            <Volume2 aria-hidden="true" />
          )}
          {sentence && t("sentence")}
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="tag-menu audio-menu"
            align="end"
            sideOffset={4}
            collisionPadding={8}
            aria-label={t("audio_sources")}
            data-srs-reader=""
          >
            {!sentence && (
              <>
                <DropdownMenu.Label className="audio-menu-heading">
                  {t("recordings")}
                </DropdownMenu.Label>
                {loading && (
                  <p className="audio-menu-status" role="status">
                    {t("finding_recordings")}
                  </p>
                )}
                {sources.map((source) => (
                  <div className="audio-source" key={source.url}>
                    <DropdownMenu.Item
                      className="select-option"
                      onSelect={(event) => {
                        event.preventDefault();
                        void play(source);
                      }}
                    >
                      {busy && active === source.url ? (
                        <LoaderCircle className="spin" aria-hidden="true" />
                      ) : (
                        <Volume2 aria-hidden="true" />
                      )}
                      <span>
                        <strong>
                          {source.name.startsWith("LL-")
                            ? "Lingua Libre"
                            : "Wikimedia Commons"}
                        </strong>
                        <small>{source.name}</small>
                      </span>
                    </DropdownMenu.Item>
                    {!settings.hideDictionarySources && (
                      <DropdownMenu.Item asChild>
                        <a
                          className="audio-source-credit"
                          href={source.page}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {source.creator} · {source.license}
                        </a>
                      </DropdownMenu.Item>
                    )}
                  </div>
                ))}
                {!loading && !sources.length && !discoveryError && (
                  <p className="audio-menu-status">
                    {t("no_recordings_found")}
                  </p>
                )}
                {discoveryError && (
                  <p
                    className="audio-menu-status translation-error"
                    role="alert"
                  >
                    {discoveryError}
                  </p>
                )}
                <DropdownMenu.Separator className="audio-menu-separator" />
              </>
            )}
            <DropdownMenu.Label className="audio-menu-heading">
              {t("system_tts")}
            </DropdownMenu.Label>
            <DropdownMenu.Item
              className="select-option"
              onSelect={(event) => {
                event.preventDefault();
                void play({ voice: settings.voice });
              }}
            >
              <Volume2 aria-hidden="true" /> {t("default_voice")}
            </DropdownMenu.Item>
            {voices.map((voice) => (
              <DropdownMenu.Item
                className="select-option"
                key={voice.voiceURI}
                onSelect={(event) => {
                  event.preventDefault();
                  void play({ voice: voice.voiceURI });
                }}
              >
                <Volume2 aria-hidden="true" /> {voice.name}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </span>
  );
}
