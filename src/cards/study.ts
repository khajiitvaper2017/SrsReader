import { parseHTML } from "linkedom";
import type {
  CardDocument,
  CardEncounter,
  CardStudyDetails,
} from "@/cards/model";
import { meaningsForEncounter } from "@/cards/encounter";
import { nounArticle } from "@/cards/noun-article";
import { readingCardIdentity } from "@/cards/encounter-key";
import { definitionsHtml } from "@/cards/snapshot";
import { lookup } from "@/dictionaries/resolve";
import { getSettings } from "@/settings/store";
import { snapshot } from "@/vocabulary/snapshot";
import { dictionaryIpa } from "@/dictionaries/ipa";
import { dictionaryPronunciations } from "@/dictionaries/pronunciation";
import type { Meaning } from "@/dictionaries/model";
import {
  dictionaryPartsOfSpeech,
  dictionaryTagValues,
  importedPartLabels,
  importedPartValues,
  matchesImportedGender,
  meaningsForImportedParts,
} from "@/dictionaries/grammar";
import {
  dictionaryInflections,
  type DictionaryInflection,
} from "@/dictionaries/inflections";
import { db } from "@/platform/database/db";
import { t } from "@/shared/i18n/i18n";
import type { Vocabulary } from "@/vocabulary/model";
import { applyDefinitionOverrides } from "@/vocabulary/definitions";

function lexicalClass(meanings: Meaning[], imported: string[]) {
  const parts = imported.length
    ? imported
    : dictionaryTagValues(meanings, "UPOS");
  const noun = parts.some((part) => part === "NOUN" || part === "PROPN");
  const verb = parts.some((part) => part === "VERB" || part === "AUX");
  return noun === verb ? undefined : noun ? "noun" : "verb";
}

export function cardStudyDetails(
  language: string,
  meanings: Meaning[],
  inflections: DictionaryInflection[],
  encounter?: CardEncounter,
  imported: string[] = [],
): CardStudyDetails {
  const study: CardStudyDetails = {
    partsOfSpeech: encounter
      ? encounter.pos
          .split(",")
          .filter(Boolean)
          .map((pos) =>
            t(`sentence_grammar.pos.${pos}`, {
              defaultValue: pos,
              nsSeparator: false,
            }),
          )
      : imported.length
        ? importedPartLabels(imported)
        : dictionaryPartsOfSpeech(meanings),
    forms: [],
    ipa: dictionaryPronunciations(meanings),
  };
  if (encounter) {
    study.grammar = Object.entries(encounter.feats)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([feature, value]) => {
        const translated = value
          .split(",")
          .map((part) =>
            t(`sentence_grammar.values.${feature}.${part}`, {
              defaultValue: part,
              nsSeparator: false,
            }),
          )
          .join(" / ");
        return /^(Animacy|Gender|Number|Case|Tense|VerbForm|Aspect|Voice|Mood|Polarity|Person)$/u.test(
          feature,
        )
          ? translated
          : `${t(`sentence_grammar.features.${feature}`, {
              defaultValue: feature,
              nsSeparator: false,
            })}: ${translated}`;
      });
  }
  const kind = lexicalClass(meanings, importedPartValues(imported));
  if (
    kind === "noun" ||
    encounter?.pos.split(",").some((pos) => pos === "NOUN" || pos === "PROPN")
  ) {
    const genders = dictionaryTagValues(
      meanings.filter((meaning) =>
        dictionaryTagValues([meaning], "UPOS").some(
          (part) => part === "NOUN" || part === "PROPN",
        ),
      ),
      "Gender",
    );
    study.article = nounArticle(language, encounter?.feats.Gender, genders);
    if (genders.length > 1) return study;
  }
  if (language !== "de" || !kind) return study;
  const categories =
    kind === "noun"
      ? [
          {
            key: "study_form_plural",
            matches: (label: string) =>
              /\b(?:nominativ|nominative)\b/iu.test(label) &&
              /\bplural\b/iu.test(label) &&
              !/person|partizip|participle/iu.test(label),
          },
        ]
      : [
          {
            key: "study_form_present",
            matches: (label: string) =>
              /(?:3\.\s*person|third.person)/iu.test(label) &&
              /\bsingular\b/iu.test(label) &&
              /\b(?:präsens|present)\b/iu.test(label) &&
              /\b(?:indikativ|indicative)\b/iu.test(label),
          },
          {
            key: "study_form_past",
            matches: (label: string) =>
              /(?:3\.\s*person|third.person)/iu.test(label) &&
              /\bsingular\b/iu.test(label) &&
              /\b(?:präteritum|past|preterite)\b/iu.test(label),
          },
          {
            key: "study_form_participle",
            matches: (label: string) =>
              /\bpartizip\s+(?:perfekt|ii|2)\b|\bpast\s+participle\b/iu.test(
                label,
              ),
          },
        ];
  for (const category of categories) {
    const forms = [
      ...new Set(
        inflections
          .filter((entry) =>
            entry.labels.some(
              (label) =>
                !/\b(?:konjunktiv|subjunctive|conditional|imperativ|imperative|passiv|passive)\b/iu.test(
                  label,
                ) && category.matches(label),
            ),
          )
          .map((entry) => entry.form),
      ),
    ];
    if (forms.length)
      study.forms.push({ label: t(category.key), value: forms.join(" / ") });
  }
  return study;
}

export async function prepareStudyDocument(
  document: CardDocument,
  saved?: Vocabulary,
): Promise<CardDocument> {
  if (!document.noteType.id.startsWith("reader:") || !document.note.wordId)
    return document;
  const encounter = document.note.encounter;
  const imported = document.note.importedPartsOfSpeech ?? [];
  const word = saved ?? (await db.vocabulary.get(document.note.wordId));
  if (!word)
    return encounter || imported.length
      ? {
          ...document,
          study: cardStudyDetails(
            document.note.language,
            [],
            [],
            encounter,
            imported,
          ),
        }
      : document;
  const { importedGenders } = readingCardIdentity(document.note, word.lemma);
  const matchesGender = (meaning: Meaning) =>
    !importedGenders?.length || matchesImportedGender(meaning, importedGenders);
  let definitions = word.meanings;
  const field = document.noteType.bindings.definitions;
  if (
    word.reading &&
    Array.isArray(document.note.source?.importedNotes) &&
    !definitions.some((meaning) => meaning.tags !== "ipa") &&
    field !== undefined &&
    /^<style>[^<]*<\/style>$/u.test(document.note.fields[field] ?? "")
  ) {
    // Older converted cards can contain only the generated stylesheet.
    const result = await lookup(
      word.lemma,
      { ...(await getSettings()), studyLanguage: word.language },
      { localOnly: true, reading: word.reading },
    );
    const match = result.words.find(
      (candidate) => candidate.id === document.note.wordId,
    );
    if (match?.meanings.some((meaning) => meaning.tags !== "ipa")) {
      definitions = (await snapshot(match)).meanings;
      const fields = [...document.note.fields];
      fields[field] += definitionsHtml(
        meaningsForImportedParts(
          applyDefinitionOverrides(definitions, word),
          imported,
        ).filter(
          (meaning) =>
            matchesGender(meaning) &&
            !word.hiddenDictionaries?.includes(meaning.dictionaryId),
        ),
      );
      document = { ...document, note: { ...document.note, fields } };
    }
  }
  let meanings = meaningsForImportedParts(
    applyDefinitionOverrides(
      [
        ...definitions.filter((meaning) => meaning.tags !== "ipa"),
        ...(await dictionaryIpa(word)),
      ],
      word,
    ),
    imported,
  ).filter(
    (meaning) =>
      matchesGender(meaning) &&
      !word.hiddenDictionaries?.includes(meaning.dictionaryId),
  );
  // Redirect forms have no sense ID, so they cannot distinguish lexical genders.
  const ambiguousGender =
    dictionaryTagValues(
      meanings.filter((meaning) =>
        dictionaryTagValues([meaning], "UPOS").some(
          (part) => part === "NOUN" || part === "PROPN",
        ),
      ),
      "Gender",
    ).length > 1;
  if (encounter) meanings = meaningsForEncounter(meanings, encounter);
  const inflections =
    word.language === "de" &&
    !ambiguousGender &&
    lexicalClass(meanings, importedPartValues(imported))
      ? await dictionaryInflections(word.lemma, meanings)
      : [];
  const study = cardStudyDetails(
    word.language,
    meanings,
    inflections,
    encounter,
    imported,
  );
  if (importedGenders?.length) {
    study.article = nounArticle(word.language, undefined, importedGenders);
    if (
      field !== undefined &&
      document.note.fields[field]?.includes("srs-meaning")
    ) {
      const { document: html } = parseHTML(
        `<html><body>${document.note.fields[field]}</body></html>`,
      );
      const sections = [
        ...html.querySelectorAll("section.srs-meaning[data-dictionary]"),
      ];
      for (const section of sections) {
        const tags =
          section.querySelector(":scope > .srs-tags")?.textContent ?? "";
        const dictionaryId = section.getAttribute("data-dictionary") ?? "";
        if (!matchesImportedGender({ dictionaryId, tags }, importedGenders))
          section.remove();
      }
      if (sections.some((section) => !section.parentElement)) {
        const fields = [...document.note.fields];
        fields[field] = html.body.innerHTML;
        document = { ...document, note: { ...document.note, fields } };
      }
    }
  }
  return { ...document, study };
}
