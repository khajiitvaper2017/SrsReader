import { ActionIcon, Box, Loader, Menu, Stack, Text } from "@mantine/core";
import { usePronunciation } from "@/audio/hooks/usePronunciation";
import type { preparePronunciation } from "@/audio/prepare";
import type { LookupWord } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { Volume2 } from "lucide-react";
export function AudioButton({
  word,
  form,
  sentence,
  noteId,
  settings,
  onError,
  prepareRecording,
}: {
  word: Pick<LookupWord, "id" | "lemma" | "language">;
  /** Additional recording-search form and word TTS text; retains the original word identity. */
  form?: string;
  sentence?: string;
  noteId?: string;
  settings: Settings;
  onError: (message: string) => void;
  /** Reuse the review session's prepared recording. */
  prepareRecording?: typeof preparePronunciation;
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
  } = usePronunciation({
    word,
    form,
    sentence,
    noteId,
    settings,
    onError,
    prepareRecording,
  });
  return (
    <Text data-srs-reader="" component="span" inherit>
      <Menu opened={open} onChange={setOpen} closeOnItemClick={false}>
        <Menu.Target>
          <Box component="span" display="inline-flex">
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-haspopup="menu"
              aria-expanded={open}
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
                event.stopPropagation();
                event.preventDefault();
                if (held.current) {
                  held.current = false;
                  return;
                }
                if (event.shiftKey) setOpen(true);
                else void play();
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "ArrowDown" ||
                  (event.shiftKey && event.key === "Enter")
                ) {
                  event.preventDefault();
                  setOpen(true);
                  return;
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void play();
                }
              }}
            >
              {busy ? (
                <Loader size={14} aria-hidden="true" />
              ) : (
                <Volume2 aria-hidden="true" size={16} />
              )}
            </ActionIcon>
          </Box>
        </Menu.Target>

        <Menu.Dropdown aria-label={t("audio_sources")} data-srs-reader="">
          {!sentence && (
            <>
              <Menu.Label>{t("recordings")}</Menu.Label>
              {loading && <Text role="status">{t("finding_recordings")}</Text>}
              {sources.map((source) => (
                <Stack key={source.url}>
                  <Menu.Item
                    onClick={(event) => {
                      event.preventDefault();
                      void play(source);
                    }}
                  >
                    {busy && active === source.url ? (
                      <Loader size={14} aria-hidden="true" />
                    ) : (
                      <Volume2 aria-hidden="true" size={16} />
                    )}
                    <span>
                      <strong>
                        {source.page.startsWith("https://forvo.com/")
                          ? "Forvo"
                          : source.creator === "LanguagePod101"
                            ? "LanguagePod101"
                            : source.name.startsWith("LL-")
                              ? "Lingua Libre"
                              : "Wikimedia Commons"}
                      </strong>
                      <Text
                        variant="supporting"
                        component="span"
                        display="block"
                      >
                        {source.name}
                      </Text>
                    </span>
                  </Menu.Item>
                  {!settings.hideDictionarySources && (
                    <Menu.Item
                      component="a"
                      href={source.page}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {[source.creator, source.license]
                        .filter(Boolean)
                        .join(" · ")}
                    </Menu.Item>
                  )}
                </Stack>
              ))}
              {!loading && !sources.length && !discoveryError && (
                <Text>{t("no_recordings_found")}</Text>
              )}
              {discoveryError && (
                <Text role="alert" c="red">
                  {discoveryError}
                </Text>
              )}
              <Menu.Divider />
            </>
          )}
          <Menu.Label>{t("system_tts")}</Menu.Label>
          <Menu.Item
            onClick={(event) => {
              event.preventDefault();
              void play({ voice: settings.voice });
            }}
          >
            <Volume2 aria-hidden="true" size={16} /> {t("default_voice")}
          </Menu.Item>
          {voices.map((voice) => (
            <Menu.Item
              key={voice.voiceURI}
              onClick={(event) => {
                event.preventDefault();
                void play({ voice: voice.voiceURI });
              }}
            >
              <Volume2 aria-hidden="true" size={16} /> {voice.name}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Text>
  );
}
