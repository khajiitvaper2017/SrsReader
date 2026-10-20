import {
  ActionIcon,
  Box,
  Button,
  Loader,
  Menu,
  Stack,
  Text,
} from "@mantine/core";
import { usePronunciation } from "@/audio/hooks/usePronunciation";
import type { LookupWord } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { Volume2 } from "lucide-react";
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
  const Control = sentence ? Button : ActionIcon;
  return (
    <Text data-srs-reader="" component="span" inherit>
      <Menu opened={open} onChange={setOpen} closeOnItemClick={false}>
        <Menu.Target>
          <Box component="span" display="inline-flex">
            <Control
              variant="subtle"
              size={sentence ? "compact-xs" : "sm"}
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
              {sentence && t("sentence")}
            </Control>
          </Box>
        </Menu.Target>

        <Menu.Dropdown aria-label={t("audio_sources")} data-srs-reader="">
          {!sentence && (
            <>
              <Menu.Label>{t("recordings")}</Menu.Label>
              {loading && <Text role="status">{t("finding_recordings")}</Text>}
              {sources.map((source) => (
                <Stack key={source.url} gap="xs">
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
                        {source.name.startsWith("LL-")
                          ? "Lingua Libre"
                          : "Wikimedia Commons"}
                      </strong>
                      <Text
                        component="small"
                        size="xs"
                        c="dimmed"
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
                      {source.creator} · {source.license}
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
