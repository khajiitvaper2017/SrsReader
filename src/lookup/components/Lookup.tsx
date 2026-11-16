import { ReadingCardSelect } from "@/cards/components/ReadingCardSelect";
import { useEffect, type ReactNode } from "react";
import { dictionaryMetadata } from "@/dictionaries/hooks/useMeanings";
import { useSettings } from "@/settings/hooks/useSettings";
import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Flex,
  Group,
  Badge,
  HoverCard,
  Menu,
  Stack,
  Text,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { AudioButton } from "@/audio/components/AudioButton";
import { FrequencyBadge } from "@/dictionaries/components/FrequencyBadge";
import { Meanings } from "@/dictionaries/components/Meanings";
import { wordMatchesGrammar } from "@/dictionaries/grammar";
import { WordExamples } from "@/examples/components/WordExamples";
import { folded } from "@/languages/text";
import { parseNumeral } from "@/languages/numerals";
import { useLookupNavigation } from "@/lookup/hooks/useLookupNavigation";
import { useLookupWord } from "@/lookup/hooks/useLookupWord";
import { Grammar } from "@/lookup/components/Grammar";
import type { LookupPage } from "@/lookup/model";
import { t } from "@/shared/i18n/i18n";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { Ratings } from "@/srs/components/Ratings";
import { SrsProgress } from "@/srs/components/SrsProgress";
import { SentenceTranslation } from "@/translation/components/SentenceTranslation";
import { vocabularyClient } from "@/vocabulary/client";
import { EditableMeanings } from "@/vocabulary/components/EditableMeanings";
import { DefinitionEditor } from "@/vocabulary/components/DefinitionEditor";
import { wordId, type ReadingContext } from "@/vocabulary/model";
import { stateOf, wordStateLabels } from "@/vocabulary/state";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  Play,
  Undo2,
} from "lucide-react";
export function Lookup() {
  const [settings] = useSettings();
  useEffect(() => {
    // Prepare source styles before the first lookup.
    void dictionaryMetadata(settings).catch(console.warn);
  }, [settings]);
  const { pages, setPages, error, session } = useLookupNavigation();
  if (!pages.length) return <ErrorBox error={error} />;
  return (
    <LookupEntry
      key={`${session}:${pages.length}`}
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
      onLookup={(next, previous) =>
        setPages((pages) => [
          ...pages.slice(0, -1),
          { ...pages[pages.length - 1]!, ...previous },
          next,
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
    next: LookupPage,
    previous: Pick<
      LookupPage,
      "selected" | "scroll" | "openDetails" | "definitionDraft"
    >,
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
    candidates,
    expandedDictionaries,
    hiddenDictionaries,
    toggleHiddenDictionary,
    toggleDictionary,
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
    reviewed,
    setLastReview,
    unparsed,
    compoundParts,
    compoundAnalysis,
    compoundSource,
    definitionDraft,
    openLookup,
    word,
    reload,
    ignoreTag,
    act,
    forget,
    undo,
    toggleMastery,
    definitionSaved,
  } = useLookupWord({ page, onLookup, onBack });
  const compound = page.compound;
  const canForget = !!saved && (!context || !!saved.cardId);
  const surface = result?.grammar?.group?.form || term;
  // Dictionary paths list possible inflections; the parser describes this occurrence.
  const dictionaryForms = result?.grammar
    ? []
    : word?.forms.filter((form) => !form.startsWith("redirected from ")) || [];
  const numeral = result?.numeral;
  const writtenNumeral =
    word &&
    numeral &&
    (folded(word.lemma, word.language) === folded(term, word.language) ||
      parseNumeral(word.lemma, word.language))
      ? numeral.readings.find((reading) => reading.kind === numeral.preferred)
          ?.text
      : undefined;
  const heading = writtenNumeral ?? word?.lemma ?? term;
  const hiddenCandidateDictionaries = new Map(
    result?.words
      .filter((candidate) => !wordMatchesGrammar(candidate, result.grammar))
      .flatMap((candidate) =>
        candidate.meanings.map(
          (meaning) => [meaning.dictionaryId, meaning.title] as const,
        ),
      ),
  );
  const renderHeader = (
    sentenceButton?: ReactNode,
    translation?: ReactNode,
    failure?: ReactNode,
  ) =>
    word && (
      <>
        <Stack
          component="header"
          pos="sticky"
          top={0}
          mt="-sm"
          pt="sm"
          bg="var(--mantine-color-body)"
          style={{ zIndex: 2 }}
          data-srs-reader
        >
          <Group align="flex-start" gap="xs" wrap="nowrap">
            {onBack && (
              <ActionIcon
                onClick={onBack}
                disabled={busy}
                title={t("back_to_previous_word")}
                aria-label={t("back_to_previous_word")}
                variant="subtle"
                style={{ flexShrink: 0 }}
              >
                <ArrowLeft aria-hidden size={16} />
              </ActionIcon>
            )}
            <Stack miw={0} flex={1} gap="xs">
              <Group gap={4} wrap="nowrap" align="flex-start">
                <HoverCard
                  disabled={
                    !result?.grammar &&
                    !compoundAnalysis &&
                    folded(surface, word.language) ===
                      folded(heading, word.language)
                  }
                  openDelay={650}
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
                      size="h2"
                      tabIndex={0}
                      style={{ minWidth: 0, overflowWrap: "anywhere" }}
                    >
                      {heading}
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
                    <Stack>
                      <Text lang={word.language} fw={500}>
                        {surface}
                      </Text>
                      {result?.grammar ? (
                        <Grammar grammar={result.grammar} />
                      ) : (
                        compoundAnalysis && (
                          <Stack gap="xs">
                            <Text variant="supporting">
                              {t("compound_source_grammar", {
                                word: compoundSource?.surface,
                              })}
                            </Text>
                            <Grammar grammar={compoundAnalysis} />
                          </Stack>
                        )
                      )}
                    </Stack>
                  </HoverCard.Dropdown>
                </HoverCard>
                {(compound ||
                  candidates.length > 1 ||
                  hiddenCandidateDictionaries.size > 0) && (
                  <Menu
                    opened={candidateOpen}
                    onChange={setCandidateOpen}
                    position="bottom-end"
                  >
                    <Menu.Target>
                      <ActionIcon
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
                      {candidates.map((candidate) => (
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
                      {compound && (
                        <Menu.Item
                          onClick={() =>
                            openLookup({
                              ...compound,
                              occurrence:
                                compound.term === compound.context.surface
                                  ? compound.occurrence
                                  : undefined,
                              compoundSource,
                              showCompoundParts: true,
                            })
                          }
                          style={{
                            whiteSpace: "normal",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {t("choose_whole_compound", {
                            word: compound.term,
                          })}
                        </Menu.Item>
                      )}
                      {[...hiddenCandidateDictionaries].map(([id, title]) => (
                        <Menu.Item
                          key={`more:${id}`}
                          closeMenuOnClick={false}
                          leftSection={
                            expandedDictionaries.includes(id) ? (
                              <ChevronUp size={14} aria-hidden="true" />
                            ) : (
                              <ChevronDown size={14} aria-hidden="true" />
                            )
                          }
                          onClick={() => toggleDictionary(id)}
                        >
                          {t(
                            expandedDictionaries.includes(id)
                              ? "show_less"
                              : "show_more",
                          )}
                          : {title}
                        </Menu.Item>
                      ))}
                    </Menu.Dropdown>
                  </Menu>
                )}
              </Group>
              <Group gap="xs">
                <FrequencyBadge word={word} />
                {word.reading && (
                  <Text variant="supporting" component="span" inherit>
                    {word.reading}
                  </Text>
                )}
                {saved && (
                  <Badge w="fit-content">
                    {t(
                      wordStateLabels[
                        stateOf(
                          saved,
                          settings.matureIntervalDays,
                          saved.encounterKey,
                        )
                      ],
                    )}
                  </Badge>
                )}
              </Group>
            </Stack>
            <Group
              gap={4}
              align="center"
              justify="flex-end"
              maw="45%"
              style={{ flexShrink: 0 }}
            >
              <ActionIcon
                title={t("add_custom_definition")}
                aria-label={t("add_custom_definition")}
                onClick={() => {
                  setEditing("add");
                  contentRef.current?.scrollTo({ top: 0 });
                }}
                disabled={busy}
                variant="subtle"
              >
                <Plus aria-hidden="true" size={16} />
              </ActionIcon>
              {sentenceButton}
              <AudioButton
                word={word}
                form={writtenNumeral}
                settings={settings}
                onError={setError}
              />
            </Group>
          </Group>

          {saved && !context && (
            <ReadingCardSelect
              word={saved}
              disabled={busy}
              onChanged={reload}
              onError={setError}
            />
          )}
        </Stack>
        {translation}
        {failure}
      </>
    );
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
        <Stack p="sm" gap="xs">
          {onBack && !word && (
            <Group gap="xs">
              <ActionIcon
                onClick={onBack}
                disabled={busy}
                title={t("back_to_previous_word")}
                aria-label={t("back_to_previous_word")}
                variant="subtle"
              >
                <ArrowLeft aria-hidden size={16} />
              </ActionIcon>
              <Title order={1} style={{ overflowWrap: "anywhere" }}>
                {term}
              </Title>
            </Group>
          )}
          <ErrorBox error={error} />
          <SrsProgress />
          {!onBack && !word && !!result?.words.length && (
            <Title order={1}>{term}</Title>
          )}
          {!word && !!result?.words.length && (
            <Stack>
              <Meanings
                meanings={result.words.flatMap(
                  (candidate) => candidate.meanings,
                )}
                language={settings.studyLanguage}
                settings={settings}
                grammar={result.grammar}
                expandedDictionaries={expandedDictionaries}
                onToggleDictionary={toggleDictionary}
              />
            </Stack>
          )}
          {word &&
            (context ? (
              <SentenceTranslation
                key={`${word.id}:${context.sentence}:${context.start}`}
                context={context}
                language={word.language}
                settings={settings}
                wordId={word.id}
                label={t("translate_current_sentence")}
                collapsed
                compact
                onTranslated={(translation) =>
                  onContext({ ...context, translation })
                }
              >
                {renderHeader}
              </SentenceTranslation>
            ) : (
              renderHeader()
            ))}
          {word && (
            <>
              {(dictionaryForms.length > 0 ||
                word.meanings.some((meaning) => meaning.grammar?.length)) && (
                <Text variant="supporting">
                  {[...new Set(dictionaryForms)]
                    .map((form) =>
                      form === "z-"
                        ? t("czech_z_prefix_form")
                        : form === "cs-imperfective"
                          ? t("czech_imperfective_form")
                          : form,
                    )
                    .join(" · ")}
                  {dictionaryForms.length > 0 &&
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
              <Stack ref={readingRef}>
                {compoundParts.length > 0 && (
                  <Group gap="xs" data-srs-reader>
                    <Text variant="supporting">{t("compound_parts")}</Text>
                    {compoundParts.map((part, index) => (
                      <Anchor
                        key={index}
                        component="button"
                        type="button"
                        onClick={() =>
                          openLookup({
                            term: part,
                            compoundSource:
                              compoundSource ??
                              (page.occurrence
                                ? {
                                    occurrence: page.occurrence,
                                    surface: page.term,
                                  }
                                : undefined),
                            selected: wordId("de", part, ""),
                            showCompoundParts: true,
                          })
                        }
                      >
                        {part}
                      </Anchor>
                    ))}
                  </Group>
                )}
                {unparsed ? (
                  <DefinitionEditor
                    key={word.id}
                    word={result?.words.length ? word : undefined}
                    term={term}
                    context={context}
                    occurrence={page.occurrence}
                    grammar={result?.grammar}
                    settings={settings}
                    draft={page.definitionDraft}
                    onDraftChange={(draft) => {
                      definitionDraft.current = draft;
                    }}
                    onSaved={definitionSaved}
                    onError={setError}
                  />
                ) : (
                  <EditableMeanings
                    word={word}
                    term={term}
                    context={context}
                    occurrence={page.occurrence}
                    settings={settings}
                    grammar={result?.grammar}
                    editing={editing}
                    onEditingChange={setEditing}
                    onSaved={definitionSaved}
                    onError={setError}
                    expandedDictionaries={expandedDictionaries}
                    hiddenDictionaries={hiddenDictionaries}
                    onToggleDictionary={toggleDictionary}
                    onToggleHiddenDictionary={toggleHiddenDictionary}
                    onIgnoreTag={(tag) => void ignoreTag(tag)}
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
        <Flex
          direction={settings.onlyAgainGood ? "row" : "column"}
          gap={settings.onlyAgainGood ? 4 : "xs"}
          p="sm"
          data-srs-reader
          style={{
            borderTop: "1px solid var(--mantine-color-default-border)",
            flexShrink: 0,
            maxHeight: "60dvh",
            overflowY: "auto",
          }}
        >
          <Group grow wrap="nowrap" align="stretch" gap={4} flex={1} miw={0}>
            <Button
              disabled={busy}
              onClick={() => void (canForget ? forget() : act())}
              variant="light"
              px={4}
              miw={0}
              flex={1}
            >
              {t(canForget ? "forget" : "mine_word")}
            </Button>
            <Button
              aria-pressed={!!saved?.known}
              disabled={busy}
              onClick={() => void toggleMastery()}
              variant="light"
              px={4}
              miw={0}
              flex={1}
            >
              {saved?.known ? t("unmaster") : t("master")}
            </Button>
            {!saved?.known && !reviewed && saved?.suspended && (
              <Button
                onClick={() =>
                  void vocabularyClient({
                    action: "suspend",
                    id: word.id,
                    value: false,
                  }).then(reload)
                }
                variant="light"
                px={4}
                miw={0}
                flex={1}
              >
                <Play aria-hidden="true" size={16} /> {t("resume")}
              </Button>
            )}
            {lastReview && (
              <Button
                title={notice}
                aria-label={t("undo")}
                disabled={busy}
                onClick={() => void undo()}
                variant="light"
                px={4}
                miw={0}
                flex={1}
              >
                <Undo2 aria-hidden="true" size={16} /> {t("cancel")}
              </Button>
            )}
          </Group>
          {!saved?.known && !reviewed && !saved?.suspended && (
            <Box flex={1} miw={0}>
              <Ratings
                compact
                times={times}
                disabled={busy}
                onlyAgainGood={settings.onlyAgainGood}
                onGrade={(rating) => void act(rating)}
              />
            </Box>
          )}
          {notice && <VisuallyHidden role="status">{notice}</VisuallyHidden>}
        </Flex>
      )}
    </Stack>
  );
}
