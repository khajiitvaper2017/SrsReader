import {
  ActionIcon,
  Button,
  Group,
  Badge,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { AudioButton } from "@/audio/components/AudioButton";
import { FrequencyBadge } from "@/dictionaries/components/FrequencyBadge";
import { Meanings } from "@/dictionaries/components/Meanings";
import { WordExamples } from "@/examples/components/WordExamples";
import { folded } from "@/languages/text";
import { useLookupNavigation } from "@/lookup/hooks/useLookupNavigation";
import { useLookupWord } from "@/lookup/hooks/useLookupWord";
import type { LookupPage } from "@/lookup/model";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { srsClient } from "@/srs/client";
import { Ratings } from "@/srs/components/Ratings";
import { SrsProgress } from "@/srs/components/SrsProgress";
import { SentenceTranslation } from "@/translation/components/SentenceTranslation";
import { vocabularyClient } from "@/vocabulary/client";
import { DefinitionEditor } from "@/vocabulary/components/DefinitionEditor";
import { stateOf, type ReadingContext } from "@/vocabulary/model";
import { wordStateLabels } from "@/vocabulary/state";
import {
  ArrowLeft,
  Check,
  Pencil,
  Play,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
export function Lookup() {
  const { pages, setPages, error } = useLookupNavigation();
  if (!pages.length) return <ErrorBox error={error} />;
  return (
    <LookupEntry
      key={pages.length}
      page={pages[pages.length - 1]!}
      onContext={(context) =>
        setPages((current) =>
          current.map((page, index) =>
            index === pages.length - 1 &&
            page.term === pages[pages.length - 1]!.term
              ? { ...page, context }
              : page,
          ),
        )
      }
      onLookup={(term, context, selected, scroll, openDetails) =>
        setPages((pages) => [
          ...pages.slice(0, -1),
          { ...pages[pages.length - 1]!, selected, scroll, openDetails },
          { term, context },
        ])
      }
      onBack={
        pages.length > 1
          ? () => setPages((pages) => pages.slice(0, -1))
          : undefined
      }
    />
  );
}
function LookupEntry({
  page,
  onLookup,
  onBack,
  onContext,
}: {
  page: LookupPage;
  onLookup: (
    term: string,
    context: ReadingContext,
    selected: string,
    scroll: number,
    openDetails: number[],
  ) => void;
  onBack?: () => void;
  onContext: (context: ReadingContext) => void;
}) {
  const {
    readingRef,
    contentRef,
    bodyRef,
    actionsRef,
    settings,
    result,
    term,
    context,
    selected,
    setSelected,
    candidateOpen,
    setCandidateOpen,
    editing,
    setEditing,
    saved,
    times,
    error,
    setError,
    busy,
    notice,
    setNotice,
    lastReview,
    setLastReview,
    unparsed,
    word,
    hasPersonalDefinition,
    reload,
    ignoreTag,
    act,
    toggleMastery,
    definitionSaved,
    deleteDefinition,
  } = useLookupWord({ page, onLookup, onBack, onContext });
  return (
    <Stack gap={0} h="100dvh" style={{ overflow: "hidden" }}>
      <Stack
        ref={contentRef}
        gap={0}
        component="main"
        style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
      >
        <Stack ref={bodyRef} gap="xs" p="sm">
          {onBack && (
            <ActionIcon
              onClick={onBack}
              disabled={busy}
              title={t("back_to_previous_word")}
              aria-label={t("back_to_previous_word")}
              variant="subtle"
            >
              <ArrowLeft aria-hidden="true" size={16} />
            </ActionIcon>
          )}
          <ErrorBox error={error} />
          <SrsProgress />
          {!result && !error && <Text c="dimmed">{t("looking_up")}</Text>}
          {word && (
            <>
              <Group gap="xs" align="center" justify="space-between">
                <Stack gap="xs">
                  <Title lang={word.language} order={1}>
                    {folded(term, word.language) !==
                      folded(word.lemma, word.language) && (
                      <Text component="span" inherit>
                        {term} →{" "}
                      </Text>
                    )}
                    {word.lemma}
                  </Title>
                  {result!.words.length > 1 && (
                    <Select
                      value={selected}
                      disabled={busy}
                      aria-label={`${t("choose_word")}: ${word.lemma}`}
                      title={t("choose_word")}
                      dropdownOpened={candidateOpen}
                      onDropdownOpen={() => setCandidateOpen(true)}
                      onDropdownClose={() => setCandidateOpen(false)}
                      data={result!.words.map((candidate) => ({
                        value: candidate.id,
                        label: [candidate.lemma, candidate.reading]
                          .filter(Boolean)
                          .join(" · "),
                      }))}
                      onChange={(value) => {
                        setSelected(value!);
                        setNotice("");
                        setLastReview("");
                      }}
                    />
                  )}
                  {word.reading && (
                    <Text component="span" inherit c="dimmed">
                      {word.reading}
                    </Text>
                  )}
                </Stack>
                <Group gap={4} align="center">
                  <FrequencyBadge word={word} />
                  {!unparsed && (
                    <ActionIcon
                      title={t("edit_definition")}
                      aria-label={t("edit_definition")}
                      disabled={busy}
                      onClick={() => setEditing((value) => !value)}
                      variant="subtle"
                    >
                      <Pencil aria-hidden="true" size={16} />
                    </ActionIcon>
                  )}
                  {hasPersonalDefinition && (
                    <ActionIcon
                      title={t("delete_custom_definition")}
                      aria-label={t("delete_custom_definition")}
                      disabled={busy}
                      onClick={() => void deleteDefinition()}
                      variant="subtle"
                      color="red"
                    >
                      <Trash2 aria-hidden="true" size={16} />
                    </ActionIcon>
                  )}
                  <AudioButton
                    word={word}
                    settings={settings}
                    onError={setError}
                  />
                </Group>
              </Group>
              <Group gap="xs" align="center">
                {saved && (
                  <Badge>
                    {t(
                      wordStateLabels[
                        stateOf(saved, settings.matureIntervalDays)
                      ],
                    )}
                  </Badge>
                )}
                {context && (
                  <SentenceTranslation
                    key={`${context.sentence}:${context.start}`}
                    context={{
                      ...context,
                      translation:
                        context.translation ||
                        saved?.contexts.find(
                          (c) =>
                            c.sentence === context.sentence &&
                            c.start === context.start,
                        )?.translation,
                    }}
                    language={word.language}
                    settings={settings}
                    wordId={word.id}
                    label={t("translate_current_sentence")}
                    collapsed
                    compact
                    onTranslated={(translation) =>
                      onContext({ ...context, translation })
                    }
                  />
                )}
              </Group>
              {(word.forms.filter(
                (form) => !form.startsWith("redirected from "),
              ).length > 0 ||
                word.meanings.some((meaning) => meaning.grammar?.length)) && (
                <Stack gap="xs" c="dimmed" fz="xs">
                  {[
                    ...new Set(
                      word.forms.filter(
                        (form) => !form.startsWith("redirected from "),
                      ),
                    ),
                  ]
                    .map((form) =>
                      form === "z-"
                        ? t("czech_z_prefix_form")
                        : form === "cs-imperfective"
                          ? t("czech_imperfective_form")
                          : form,
                    )
                    .join(" · ")}
                  {word.forms.length > 0 &&
                    word.meanings.some((meaning) => meaning.grammar?.length) &&
                    " · "}
                  {word.meanings
                    .flatMap((meaning) => meaning.grammar || [])
                    .map((part, index) => (
                      <span key={index} title={part.title}>
                        {part.text}
                      </span>
                    ))}
                </Stack>
              )}
              <Stack ref={readingRef} gap="xs">
                {unparsed || editing ? (
                  <DefinitionEditor
                    key={word.id}
                    word={unparsed ? undefined : word}
                    term={term}
                    context={context}
                    settings={settings}
                    onSaved={definitionSaved}
                    onError={setError}
                    onCancel={unparsed ? undefined : () => setEditing(false)}
                  />
                ) : (
                  <Meanings
                    meanings={word.meanings}
                    language={word.language}
                    settings={settings}
                    onIgnoreTag={(tag) => void ignoreTag(tag)}
                  />
                )}
                <WordExamples
                  word={word}
                  settings={settings}
                  surface={context?.surface || term}
                />
              </Stack>
            </>
          )}
        </Stack>
      </Stack>
      {word && !unparsed && (
        <Stack
          ref={actionsRef}
          gap="xs"
          p="xs"
          data-srs-reader
          style={{
            borderTop: "1px solid var(--mantine-color-default-border)",
            flexShrink: 0,
            maxHeight: "60dvh",
            overflowY: "auto",
          }}
        >
          <Stack gap="xs">
            <Group gap="xs" align="center">
              {!saved?.card && !saved?.known && (
                <Button
                  disabled={busy}
                  onClick={() => void act()}
                  variant="filled"
                >
                  <Plus aria-hidden="true" size={16} /> {t("mine_word")}
                </Button>
              )}
              <Button
                aria-pressed={!!saved?.known}
                disabled={busy}
                onClick={() => void toggleMastery()}
                variant="subtle"
              >
                <Check aria-hidden="true" size={16} />
                {saved?.known ? t("unmaster") : t("master")}
              </Button>
            </Group>
            {saved?.known ? null : saved?.suspended ? (
              <Button
                onClick={() =>
                  void vocabularyClient({
                    action: "suspend",
                    id: word.id,
                    value: false,
                  }).then(reload)
                }
                variant="subtle"
              >
                <Play aria-hidden="true" size={16} /> {t("resume")}
              </Button>
            ) : (
              <>
                <Ratings
                  times={times}
                  disabled={busy}
                  onlyAgainGood={settings.onlyAgainGood}
                  onGrade={(rating) => void act(rating)}
                />
              </>
            )}
          </Stack>
          {notice && (
            <Stack role="status" gap="xs">
              {notice}
              {lastReview && (
                <ActionIcon
                  title={t("undo")}
                  aria-label={t("undo")}
                  disabled={busy}
                  onClick={() =>
                    void srsClient({ action: "undo", id: lastReview })
                      .then(() => {
                        setLastReview("");
                        setNotice(t("review_undone"));
                        reload();
                      })
                      .catch((error) => setError(error.message))
                  }
                  variant="subtle"
                >
                  <Undo2 aria-hidden="true" size={16} />
                </ActionIcon>
              )}
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  );
}
