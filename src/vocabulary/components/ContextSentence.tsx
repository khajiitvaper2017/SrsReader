import { ActionIcon, Anchor, Box, Group, Stack, Text } from "@mantine/core";
import { AudioButton } from "@/audio/components/AudioButton";
import type { LookupWord } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { SentenceTranslation } from "@/translation/components/SentenceTranslation";
import { Sentence } from "@/vocabulary/components/Sentence";
import type { ReadingContext } from "@/vocabulary/model";
import { ChevronRight } from "lucide-react";

export function ContextSentence({
  word,
  context,
  settings,
  onError,
  position,
  onNext,
}: {
  word: Pick<LookupWord, "id" | "lemma" | "language">;
  context: ReadingContext;
  settings: Settings;
  onError: (message: string) => void;
  position?: string;
  onNext?: () => void;
}) {
  return (
    <SentenceTranslation
      compact
      context={context}
      language={word.language}
      settings={settings}
      autoTranslate={
        settings.autoTranslateSentences && settings.showSentenceTranslation
      }
      wordId={word.id}
    >
      {(translationButton, translation, failure) => (
        <Stack gap="xs">
          <Group wrap="nowrap" align="flex-start">
            <Box miw={0} flex={1}>
              {(settings.showSentenceTranslation && translation) || (
                <Sentence context={context} language={word.language} />
              )}
            </Box>
            <Group
              gap={0}
              wrap="nowrap"
              data-srs-reader
              style={{ flexShrink: 0 }}
            >
              {settings.showSentenceTranslation && translationButton}
              <AudioButton
                word={word}
                sentence={context.sentence}
                settings={settings}
                onError={onError}
              />
              {onNext && (
                <ActionIcon
                  variant="subtle"
                  title={position || t("another_example")}
                  aria-label={position || t("another_example")}
                  onClick={onNext}
                >
                  <ChevronRight aria-hidden size={16} />
                </ActionIcon>
              )}
            </Group>
          </Group>
          {failure}
          {!settings.hideDictionarySources && (
            <Group gap="xs" data-srs-reader>
              {context.url.startsWith("http") ? (
                <Anchor
                  href={context.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {context.title || new URL(context.url).hostname}
                </Anchor>
              ) : (
                <Text variant="supporting">
                  {context.title || t("study_cached_sentence")}
                </Text>
              )}
            </Group>
          )}
        </Stack>
      )}
    </SentenceTranslation>
  );
}
