import { ActionIcon, Box, Group, Loader, Menu, Text } from "@mantine/core";
import type { AudioInfo } from "@/audio/model";
import { usePronunciation } from "@/audio/hooks/usePronunciation";
import type { preparePronunciation } from "@/audio/prepare";
import type { LookupWord } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { ChevronDown, ChevronUp, ExternalLink, Volume2 } from "lucide-react";
import { useState } from "react";

function recordingProvider(source: AudioInfo) {
  if (source.page.startsWith("https://forvo.com/")) return "Forvo";
  if (source.creator === "LanguagePod101") return "LanguagePod101";
  return source.name.startsWith("LL-") ? "Lingua Libre" : "Wikimedia Commons";
}

export function AudioButton({
  word,
  form,
  sentence,
  noteId,
  cardId,
  settings,
  onError,
  prepareRecording,
  recording,
}: (
  | { word: Pick<LookupWord, "id" | "lemma" | "language">; recording?: never }
  | { word?: never; recording: Blob }
) & {
  /** Additional recording-search form and word TTS text; retains the original word identity. */
  form?: string;
  sentence?: string;
  noteId?: string;
  cardId?: string;
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
    cardRecording,
    hold,
    held,
    play,
    label,
  } = usePronunciation({
    word,
    form,
    sentence,
    noteId,
    cardId,
    settings,
    onError,
    prepareRecording,
    recording,
  });
  const [showRecordings, setShowRecordings] = useState(false);
  const [showVoices, setShowVoices] = useState(false);
  const providers = new Set<string>();
  const firstRecordings: AudioInfo[] = [];
  const moreRecordings: AudioInfo[] = [];
  for (const source of sources) {
    const provider = recordingProvider(source);
    if (providers.has(provider)) moreRecordings.push(source);
    else {
      firstRecordings.push(source);
      providers.add(provider);
    }
  }
  const speaker = <Volume2 aria-hidden size={16} />;
  const recordingItem = (source: AudioInfo) => (
    <Group key={source.url} gap={0} wrap="nowrap" role="presentation">
      <Menu.Item
        flex={1}
        miw={0}
        title={source.name}
        leftSection={
          busy && active === source.url ? (
            <Loader size={16} aria-hidden />
          ) : (
            speaker
          )
        }
        onClick={() => void play(source)}
      >
        <Text span inherit fw={600}>
          {recordingProvider(source)}
        </Text>
        {showRecordings && (
          <Text variant="supporting" component="span" display="block">
            {source.name}
          </Text>
        )}
      </Menu.Item>
      {!settings.hideDictionarySources && (
        <Menu.Item
          component="a"
          href={source.page}
          target="_blank"
          rel="noopener noreferrer"
          w="auto"
          px="xs"
          title={[source.creator, source.license].filter(Boolean).join(", ")}
          aria-label={t("audio_recording_source", { name: source.name })}
        >
          <ExternalLink aria-hidden size={14} />
        </Menu.Item>
      )}
    </Group>
  );
  return (
    <Text data-srs-reader="" component="span" inherit>
      <Menu
        disabled={!word}
        opened={open}
        onChange={setOpen}
        closeOnItemClick={false}
        width="min(20rem, calc(100vw - 16px))"
        middlewares={{
          flip: { padding: 8 },
          shift: { padding: 8 },
          size: { padding: 8 },
        }}
        preventPositionChangeWhenVisible={false}
        styles={{
          dropdown: {
            overflowY: "auto",
            overscrollBehavior: "contain",
            overflowWrap: "anywhere",
          },
        }}
        onExitTransitionEnd={() => {
          setShowRecordings(false);
          setShowVoices(false);
        }}
      >
        <Menu.Target>
          <Box component="span" display="inline-flex">
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-haspopup={word ? "menu" : undefined}
              aria-expanded={word ? open : undefined}
              title={word ? t("audio_button_hint", { action: label }) : label}
              aria-label={label}
              aria-busy={busy}
              onPointerDown={(event) => {
                if (!word) return;
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
                if (!word) return;
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
                if (word && event.shiftKey) setOpen(true);
                else void play();
              }}
              onKeyDown={(event) => {
                if (
                  word &&
                  (event.key === "ArrowDown" ||
                    (event.shiftKey && event.key === "Enter"))
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
              {busy ? <Loader size={14} aria-hidden="true" /> : speaker}
            </ActionIcon>
          </Box>
        </Menu.Target>

        <Menu.Dropdown aria-label={t("audio_sources")} data-srs-reader="">
          {!sentence && (
            <>
              <Menu.Label>{t("recordings")}</Menu.Label>
              {cardRecording && (
                <Menu.Item
                  leftSection={speaker}
                  onClick={() => void play("card")}
                >
                  {t("audio_card_recording")}
                </Menu.Item>
              )}
              {firstRecordings.map(recordingItem)}
              {!!moreRecordings.length && (
                <Menu.Item
                  leftSection={
                    showRecordings ? (
                      <ChevronUp aria-hidden size={16} />
                    ) : (
                      <ChevronDown aria-hidden size={16} />
                    )
                  }
                  aria-expanded={showRecordings}
                  onClick={() => setShowRecordings((value) => !value)}
                >
                  {t(
                    showRecordings
                      ? "audio_fewer_recordings"
                      : "audio_more_recordings",
                  )}
                </Menu.Item>
              )}
              {showRecordings && moreRecordings.map(recordingItem)}
              {loading && (
                <Text variant="supporting" px="xs" py={4} role="status">
                  {t("finding_recordings")}
                </Text>
              )}
              {!loading &&
                !cardRecording &&
                !sources.length &&
                !discoveryError && (
                  <Text variant="supporting" px="xs" py={4}>
                    {t("no_recordings_found")}
                  </Text>
                )}
              {discoveryError && (
                <Text role="alert" c="red" px="xs" py={4}>
                  {discoveryError}
                </Text>
              )}
              <Menu.Divider />
            </>
          )}
          <Menu.Label>{t("system_tts")}</Menu.Label>
          <Menu.Item
            leftSection={speaker}
            onClick={() => void play({ voice: settings.voice })}
          >
            {t("default_voice")}
          </Menu.Item>
          {!!voices.length && (
            <Menu.Item
              leftSection={
                showVoices ? (
                  <ChevronUp aria-hidden size={16} />
                ) : (
                  <ChevronDown aria-hidden size={16} />
                )
              }
              aria-expanded={showVoices}
              onClick={() => setShowVoices((value) => !value)}
            >
              {t(showVoices ? "audio_fewer_voices" : "audio_more_voices")}
            </Menu.Item>
          )}
          {showVoices &&
            voices.map((voice) => (
              <Menu.Item
                key={voice.voiceURI}
                leftSection={speaker}
                onClick={() => void play({ voice: voice.voiceURI })}
              >
                {voice.name}
              </Menu.Item>
            ))}
        </Menu.Dropdown>
      </Menu>
    </Text>
  );
}
