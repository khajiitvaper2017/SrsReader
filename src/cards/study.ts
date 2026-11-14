import type {
  CardDocument,
  CardEncounter,
  CardStudyDetails,
} from "@/cards/model";
import { meaningsForEncounter } from "@/cards/encounter";
import type { Meaning } from "@/dictionaries/model";
import {
  dictionaryPartsOfSpeech,
  dictionaryTagValues,
} from "@/dictionaries/grammar";
import {
  dictionaryInflections,
  type DictionaryInflection,
} from "@/dictionaries/inflections";
import { db } from "@/platform/database/db";
import { t } from "@/shared/i18n/i18n";
import type { Vocabulary } from "@/vocabulary/model";
import { applyDefinitionOverrides } from "@/vocabulary/definitions";

const articles: Record<string, string> = {
  Masc: "der",
  Fem: "die",
  Neut: "das",
};

function lexicalClass(meanings: Meaning[]) {
  const parts = dictionaryTagValues(meanings, "UPOS");
  const noun = parts.some((part) => part === "NOUN" || part === "PROPN");
  const verb = parts.some((part) => part === "VERB" || part === "AUX");
  return noun === verb ? undefined : noun ? "noun" : "verb";
}

function pronunciation(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(pronunciation);
  if (!value || typeof value !== "object") return [];
  const node = value as Record<string, unknown>;
  const data = node.data as Record<string, unknown> | undefined;
  const marker = [
    node.type,
    node.class,
    node.className,
    data?.content,
    data?.type,
  ];
  if (
    marker.some(
      (value) =>
        typeof value === "string" &&
        /(?:^|[\s_-])ipa(?:$|[\s_-])/iu.test(value),
    )
  ) {
    function text(value: unknown): string {
      if (typeof value === "string") return value;
      if (Array.isArray(value)) return value.map(text).join("");
      if (!value || typeof value !== "object") return "";
      const node = value as Record<string, unknown>;
      return text(node.content ?? node.text);
    }
    const ipa = text(node.content ?? node.text).trim();
    return ipa ? [ipa] : [];
  }
  return pronunciation(node.content);
}

export function cardStudyDetails(
  language: string,
  meanings: Meaning[],
  inflections: DictionaryInflection[],
  encounter?: CardEncounter,
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
      : dictionaryPartsOfSpeech(meanings),
    forms: [],
    ipa: [
      ...new Set(
        meanings.flatMap((meaning) =>
          (meaning.customDefinitions ?? meaning.definitions).flatMap(
            pronunciation,
          ),
        ),
      ),
    ],
  };
  if (encounter) {
    study.surface = encounter.context.surface;
    study.article = encounter.article;
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
  if (language !== "de") return study;
  const kind = lexicalClass(meanings);
  if (!kind) return study;
  if (kind === "noun") {
    const genders = dictionaryTagValues(
      meanings.filter((meaning) =>
        dictionaryTagValues([meaning], "UPOS").some(
          (part) => part === "NOUN" || part === "PROPN",
        ),
      ),
      "Gender",
    );
    if (!encounter && genders.length === 1) {
      study.article = articles[genders[0]!];
    }
    if (genders.length > 1) return study;
  }
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
  const word = saved ?? (await db.vocabulary.get(document.note.wordId));
  if (!word)
    return encounter
      ? {
          ...document,
          study: cardStudyDetails(document.note.language, [], [], encounter),
        }
      : document;
  let meanings: Vocabulary["meanings"] = applyDefinitionOverrides(
    word.meanings,
    word,
  ).filter(
    (meaning) => !word.hiddenDictionaries?.includes(meaning.dictionaryId),
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
    word.language === "de" && !ambiguousGender && lexicalClass(meanings)
      ? await dictionaryInflections(word.lemma, meanings)
      : [];
  const study = cardStudyDetails(
    word.language,
    meanings,
    inflections,
    encounter,
  );
  return { ...document, study };
}
