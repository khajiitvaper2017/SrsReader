import { usePronunciation } from "@/audio/hooks/usePronunciation";
import type { LookupWord } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LoaderCircle, Volume2 } from "lucide-react";

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
  const {
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
  } = usePronunciation({ word, sentence, settings, onError });

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
