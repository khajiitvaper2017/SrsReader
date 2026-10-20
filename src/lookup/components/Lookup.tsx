import type { Occurrence } from "@/languages/analysis";
import {
  ActionIcon,
  Button,
  Group,
  Badge,
  HoverCard,
  Menu,
  SimpleGrid,
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
import { Grammar } from "@/lookup/components/Grammar";
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
  ChevronDown,
  Pencil,
  Play,
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
      onLookup={(term, context, selected, scroll, openDetails, occurrence) =>
        setPages((pages) => [
          ...pages.slice(0, -1),
          { ...pages[pages.length - 1]!, selected, scroll, openDetails },
          { term, context, occurrence },
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
    occurrence?: Occurrence,
  ) => void;
  onBack?: () => void;
  onContext: (context: ReadingContext) => void;
}) {
  const {
    readingRef,
    contentRef,
    settings,
    result,
    term,
    context,
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
  const surface = result?.grammar?.group?.form || term;
  return (
    <Stack gap={0} h="100dvh" style={{ overflow: "hidden" }}>
      <Stack
        ref={contentRef}
        gap={0}
        component="main"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          scrollbarGutter: "stable",
        }}
      >
        <Stack gap="xs" p="sm">
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
                <Stack gap="xs" miw={0} maw="100%">
                  <Group gap={4} wrap="nowrap">
                    <HoverCard
                      disabled={
                        !result?.grammar &&
                        folded(surface, word.language) ===
                          folded(word.lemma, word.language)
                      }
                      events={{ hover: true, focus: true, touch: true }}
                      position="bottom-start"
                      width={360}
                      middlewares={{
                        shift: {
                          boundary: contentRef.current ?? undefined,
                          padding: 12,
                        },
                        size: {
                          boundary: contentRef.current ?? undefined,
                          padding: 12,
                        },
                      }}
                      interactive
                      role="tooltip"
                    >
                      <HoverCard.Target>
                        <Title
                          lang={word.language}
                          order={1}
                          tabIndex={0}
                          style={{ minWidth: 0, overflowWrap: "anywhere" }}
                        >
                          {word.lemma}
                        </Title>
                      </HoverCard.Target>
                      <HoverCard.Dropdown
                        data-srs-reader
                        maw="calc(100vw - 24px)"
                        mah="65dvh"
                        style={{
                          overflowY: "auto",
                          overflowWrap: "anywhere",
                          scrollbarGutter: "stable",
                        }}
                      >
                        <Stack gap="xs">
                          <Text lang={word.language} size="sm" fw={500}>
                            {surface}
                          </Text>
                          {result?.grammar && (
                            <Grammar grammar={result.grammar} />
                          )}
                        </Stack>
                      </HoverCard.Dropdown>
                    </HoverCard>
                    {result!.words.length > 1 && (
                      <Menu
                        opened={candidateOpen}
                        onChange={setCandidateOpen}
                        position="bottom-end"
                      >
                        <Menu.Target>
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            disabled={busy}
                            aria-label={`${t("choose_word")}: ${word.lemma}`}
                            title={t("choose_word")}
                            style={{ flexShrink: 0 }}
                          >
                            <ChevronDown aria-hidden="true" size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown
                          data-srs-reader
                          maw="calc(100vw - 24px)"
                          mah="50dvh"
                          style={{
                            overflowY: "auto",
                            scrollbarGutter: "stable",
                          }}
                        >
                          {result!.words.map((candidate) => (
                            <Menu.Item
                              key={candidate.id}
                              leftSection={
                                candidate.id === word.id ? (
                                  <Check aria-hidden="true" size={14} />
                                ) : undefined
                              }
                              aria-current={
                                candidate.id === word.id ? "true" : undefined
                              }
                              onClick={() => {
                                setSelected(candidate.id);
                                setNotice("");
                                setLastReview("");
                              }}
                              style={{
                                whiteSpace: "normal",
                                overflowWrap: "anywhere",
                              }}
                            >
                              {[candidate.lemma, candidate.reading]
                                .filter(Boolean)
                                .join(" · ")}
                            </Menu.Item>
                          ))}
                        </Menu.Dropdown>
                      </Menu>
                    )}
                  </Group>
                  {word.reading && (
                    <Text component="span" inherit c="dimmed">
                      {word.reading}
                    </Text>
                  )}
                </Stack>
                <Group gap={4} align="center">
                  <FrequencyBadge word={word} />
                  <AudioButton
                    word={word}
                    settings={settings}
                    onError={setError}
                  />
                </Group>
              </Group>
              <Group gap="xs" align="center" justify="space-between">
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
                  <Stack gap={0} ml="auto" style={{ flex: 1, minWidth: 0 }}>
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
                  </Stack>
                )}
              </Group>
              {(word.forms.filter(
                (form) => !form.startsWith("redirected from "),
              ).length > 0 ||
                word.meanings.some((meaning) => meaning.grammar?.length)) && (
                <Text c="dimmed" size="xs">
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
                </Text>
              )}
              <Stack ref={readingRef} gap="xs">
                {unparsed || editing ? (
                  <DefinitionEditor
                    key={word.id}
                    word={unparsed ? undefined : word}
                    term={term}
                    context={context}
                    occurrence={page.occurrence}
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
                    actions={
                      <>
                        <ActionIcon
                          title={t("edit_definition")}
                          aria-label={t("edit_definition")}
                          disabled={busy}
                          onClick={() => setEditing(true)}
                          variant="subtle"
                        >
                          <Pencil aria-hidden="true" size={16} />
                        </ActionIcon>
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
                      </>
                    }
                  />
                )}
                <WordExamples
                  word={word}
                  settings={settings}
                  surface={surface}
                />
              </Stack>
            </>
          )}
        </Stack>
      </Stack>
      {word && !unparsed && (
        <Stack
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
          <SimpleGrid
            cols={
              (!saved?.card && !saved?.known ? 1 : 0) +
              1 +
              (saved?.known
                ? 0
                : saved?.suspended
                  ? 1
                  : settings.onlyAgainGood
                    ? 2
                    : 4)
            }
            spacing={4}
          >
            {!saved?.card && !saved?.known && (
              <Button
                disabled={busy}
                onClick={() => void act()}
                variant="light"
                h={40}
                px={4}
                miw={0}
              >
                {t("mine_word")}
              </Button>
            )}
            <Button
              aria-pressed={!!saved?.known}
              disabled={busy}
              onClick={() => void toggleMastery()}
              variant="light"
              h={40}
              px={4}
              miw={0}
            >
              {saved?.known ? t("unmaster") : t("master")}
            </Button>
            {saved?.known ? null : saved?.suspended ? (
              <Button
                onClick={() =>
                  void vocabularyClient({
                    action: "suspend",
                    id: word.id,
                    value: false,
                  }).then(reload)
                }
                variant="light"
                h={40}
                px={4}
                miw={0}
              >
                <Play aria-hidden="true" size={16} /> {t("resume")}
              </Button>
            ) : (
              <Ratings
                times={times}
                compact
                disabled={busy}
                onlyAgainGood={settings.onlyAgainGood}
                onGrade={(rating) => void act(rating)}
              />
            )}
          </SimpleGrid>
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
