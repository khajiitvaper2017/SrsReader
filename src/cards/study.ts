import { parseHTML } from "linkedom";
import type {
  CardDocument,
  CardEncounter,
  CardStudyDetails,
} from "@/cards/model";
import { meaningsForEncounter } from "@/cards/encounter";
import { nounArticle } from "@/cards/noun-article";
import { lookupCardWord } from "@/cards/dictionary-word";
import { germanReflexiveBase } from "@/languages/text";
import { readingCardIdentity } from "@/cards/encounter-key";
import { prepareDictionarySnapshot } from "@/cards/snapshot";
import { dictionaryDisplay } from "@/dictionaries/display";
import { getSettings } from "@/settings/store";
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
  if (imported.some((part) => /^phrase$/i.test(part))) return undefined;
  const supplied = importedPartValues(imported);
  const parts = supplied.length
    ? supplied
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
  const kind = lexicalClass(meanings, imported);
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
          {
            key: "study_form_genitive",
            matches: (label: string) =>
              /\b(?:genitiv|genitive)\b/iu.test(label) &&
              /\bsingular\b/iu.test(label),
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
  const reader = document.noteType.id.startsWith("reader:");
  if (!document.note.wordId) return document;
  const encounter = document.note.encounter;
  const imported = document.note.importedPartsOfSpeech ?? [];
  const word = saved ?? (await db.vocabulary.get(document.note.wordId));
  if (!word)
    return reader && (encounter || imported.length)
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
  const matchesGender = (meaning: Pick<Meaning, "dictionaryId" | "tags">) =>
    !importedGenders?.length || matchesImportedGender(meaning, importedGenders);
  const settings = { ...(await getSettings()), studyLanguage: word.language };
  const live =
    (await lookupCardWord(word.lemma, word.reading, settings, { imported }))
      ?.meanings ?? [];
  const liveDictionaries = new Set(live.map((meaning) => meaning.dictionaryId));
  const visible = (id: string) =>
    !word.hiddenDictionaries?.includes(id) &&
    dictionaryDisplay(id, settings) !== "hide";
  let meanings = meaningsForImportedParts(
    applyDefinitionOverrides(
      [
        ...word.meanings.filter(
          (meaning) =>
            meaning.tags !== "ipa" &&
            !liveDictionaries.has(meaning.dictionaryId),
        ),
        ...live.filter((meaning) => meaning.tags !== "ipa"),
        ...(reader ? await dictionaryIpa(word) : []),
      ],
      word,
    ),
    imported,
  ).filter(
    (meaning) => matchesGender(meaning) && visible(meaning.dictionaryId),
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
    reader &&
    word.language === "de" &&
    !ambiguousGender &&
    lexicalClass(meanings, imported)
      ? await dictionaryInflections(
          germanReflexiveBase(word.language, word.lemma) ?? word.lemma,
          meanings,
        )
      : [];
  const study = cardStudyDetails(
    word.language,
    meanings,
    inflections,
    encounter,
    imported,
  );
  if (imported.some((part) => /^phrase$/i.test(part)))
    study.article = undefined;
  else if (importedGenders?.length)
    study.article = nounArticle(word.language, undefined, importedGenders);
  else if (/\s/u.test(word.lemma)) study.article = undefined;
  const field = document.noteType.bindings.definitions;
  let stored =
    reader && field !== undefined ? (document.note.fields[field] ?? "") : "";
  if (stored.includes("srs-meaning")) {
    const { document: html } = parseHTML(`<html><body>${stored}</body></html>`);
    for (const section of html.querySelectorAll(
      "section.srs-meaning[data-dictionary]",
    )) {
      const dictionaryId = section.getAttribute("data-dictionary")!;
      const tags =
        section.querySelector(":scope > .srs-tags")?.textContent ?? "";
      if (
        liveDictionaries.has(dictionaryId) ||
        !visible(dictionaryId) ||
        !matchesGender({ dictionaryId, tags })
      )
        section.remove();
    }
    stored = html.body.innerHTML;
  }
  const fresh = meanings.filter((meaning) =>
    liveDictionaries.has(meaning.dictionaryId),
  );
  if (fresh.length) {
    const { html, dictionaryAssets } = await prepareDictionarySnapshot(
      { id: document.note.wordId, meanings: fresh },
      { live: true },
    );
    stored += html;
    study.dictionaryAssets = dictionaryAssets;
  }
  study.definitions = stored;
  return { ...document, study };
}
