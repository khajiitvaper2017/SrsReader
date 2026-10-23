import { ActionIcon, Anchor, Box, Group, Stack, Text } from "@mantine/core";
import type { LookupWord } from "@/dictionaries/model";
import { examplesClient } from "@/examples/client";
import type { Example } from "@/examples/model";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { SentenceTranslation } from "@/translation/components/SentenceTranslation";
import { Sentence } from "@/vocabulary/components/Sentence";
import { ChevronRight, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
export function WordExamples({
  word,
  settings,
  surface = word.lemma,
}: {
  word: Pick<LookupWord, "lemma" | "language">;
  settings: Settings;
  surface?: string;
}) {
  const [examples, setExamples] = useState<Example[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [installed, setInstalled] = useState(true);
  useEffect(() => {
    let alive = true;
    setExamples([]);
    setIndex(0);
    setError("");
    setInstalled(true);
    void examplesClient({ action: "examples", lemma: word.lemma, surface })
      .then((result) => {
        if (alive) {
          setExamples(result.examples);
          setInstalled(result.installed);
        }
      })
      .catch((error) => {
        if (alive) setError(error.message);
      });
    return () => {
      alive = false;
    };
  }, [word.lemma, word.language, surface]);
  const example = examples[index];
  if (error)
    return (
      <Text role="alert" c="red">
        {error}
      </Text>
    );
  if (!example)
    return installed ? null : (
      <Anchor
        data-srs-reader=""
        href={browser.runtime.getURL("/app.html") + "#settings"}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Download aria-hidden="true" size={16} />{" "}
        {t("download_example_sentences")}
      </Anchor>
    );
  return (
    <SentenceTranslation
      compact
      key={example.id}
      context={example.context}
      language={word.language}
      settings={settings}
    >
      {(translationButton, translation, failure) => (
        <Stack
          data-reading-source-url={example.context.url}
          data-reading-source-title={example.context.title}
        >
          <Group wrap="nowrap" align="flex-start">
            <Box style={{ flex: 1, minWidth: 0 }}>
              {translation || (
                <Sentence context={example.context} language={word.language} />
              )}
            </Box>
            <Group wrap="nowrap" data-srs-reader style={{ flexShrink: 0 }}>
              {examples.length > 1 && (
                <ActionIcon
                  title={t("another_example")}
                  aria-label={t("another_example")}
                  onClick={() => setIndex((index + 1) % examples.length)}
                  variant="subtle"
                >
                  <ChevronRight aria-hidden="true" size={16} />
                </ActionIcon>
              )}
              {translationButton}
            </Group>
          </Group>
          {failure}
          {!settings.hideDictionarySources && (
            <Group data-srs-reader="" align="center" justify="space-between">
              <Anchor
                href={example.context.url}
                target="_blank"
                rel="noopener noreferrer"
                title="CC BY 2.0 FR"
              >
                Tatoeba · {example.author}
              </Anchor>
            </Group>
          )}
        </Stack>
      )}
    </SentenceTranslation>
  );
}
