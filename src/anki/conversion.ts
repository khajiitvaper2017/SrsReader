import { ankiFieldText as plain } from "@/anki/field-text";
import { readerNote } from "@/cards/defaults";
import { lookupCardWord } from "@/cards/dictionary-word";
import { reviewAnswerMaxLength, type FieldBindings } from "@/cards/model";
import { germanNounField } from "@/cards/noun-article";
import { prepareDictionarySnapshot } from "@/cards/snapshot";
import { fieldText as noteFieldText } from "@/cards/storage";
import { fieldText } from "@/cards/template";
import {
  matchesImportedGender,
  meaningsForImportedParts,
} from "@/dictionaries/grammar";
import { db } from "@/platform/database/db";
import type { Settings } from "@/settings/model";
import { applyDefinitionOverrides } from "@/vocabulary/definitions";
import { wordId, type Vocabulary } from "@/vocabulary/model";
import { freshWord } from "@/vocabulary/service";

export async function ankiWord(
  values: string[],
  bindings: FieldBindings,
  settings: Settings,
  convert: boolean,
) {
  if (bindings.word === undefined) return;
  const text = plain(values[bindings.word]!);
  if (!text) return;
  const language = settings.studyLanguage;
  const { lemma, gender } =
    language === "de"
      ? germanNounField(text)
      : { lemma: text, gender: undefined };
  const reading =
    bindings.reading === undefined
      ? ""
      : plain(values[bindings.reading]!, true);
  const found = convert
    ? await lookupCardWord(lemma, reading, settings, {
        imported: ankiPartOfSpeech(values, bindings),
        localOnly: false,
      })
    : undefined;
  const legacyId = gender && wordId(language, text, reading);
  const legacyNote =
    convert && legacyId ? await db.notes.get(legacyId) : undefined;
  const entry = {
    id: legacyNote?.wordId ?? wordId(language, lemma, reading),
    language,
    lemma,
    reading,
    meanings: found?.meanings ?? [],
    forms: found?.forms ?? [],
  };
  const saved = (await db.vocabulary.get(entry.id)) ?? freshWord(entry);
  const word = convert
    ? {
        ...saved,
        meanings: [
          ...saved.meanings.filter(
            (meaning) => meaning.dictionaryId === "personal",
          ),
          ...entry.meanings.filter(
            (meaning) => meaning.dictionaryId !== "personal",
          ),
        ],
      }
    : saved;
  return { word, gender };
}

export function ankiPartOfSpeech(values: string[], bindings: FieldBindings) {
  const pos = bindings.pos === undefined ? "" : plain(values[bindings.pos]!);
  return pos ? [pos] : undefined;
}

export function ankiReviewAnswer(values: string[], bindings: FieldBindings) {
  if (bindings.definitions === undefined) return;
  const answer = noteFieldText(
    (values[bindings.definitions] ?? "")
      .replace(/\[sound:[^\]]*\]/g, "")
      .replace(/<\/(?:div|p|li)>/gi, "<br>"),
  );
  return (
    answer
      .slice(0, reviewAnswerMaxLength)
      .replace(/[\uD800-\uDBFF]$/u, "")
      .trim() || undefined
  );
}

export function ankiDictionarySnapshot(
  word: Vocabulary,
  namespace: string,
  parts: string[] = [],
  genders: string[] = [],
) {
  return prepareDictionarySnapshot(
    {
      ...word,
      meanings: meaningsForImportedParts(
        applyDefinitionOverrides(word.meanings, word),
        parts,
      ).filter(
        (meaning) => !genders.length || matchesImportedGender(meaning, genders),
      ),
    },
    { namespace },
  );
}

export function convertedAnkiNote(
  word: Vocabulary,
  fields: { name: string }[],
  values: string[],
  bindings: FieldBindings,
  namespace: string,
  omitted: ReadonlySet<number>,
) {
  const mapped = new Set(Object.values(bindings));
  const extra = fields.flatMap((field, index) =>
    mapped.has(index) || omitted.has(index)
      ? []
      : [{ name: field.name, value: values[index]! }],
  );
  const lemma =
    word.language === "de" ? germanNounField(word.lemma).lemma : word.lemma;
  const { note, noteType } = readerNote({ ...word, lemma }, undefined, extra);
  note.mediaNamespace = namespace;
  note.reviewAnswer = ankiReviewAnswer(values, bindings);
  if (bindings.hint !== undefined)
    note.hint =
      fieldText(
        (values[bindings.hint] ?? "").replace(/\[sound:[^\]]*\]/g, ""),
      ) || undefined;
  note.importedPartsOfSpeech = ankiPartOfSpeech(values, bindings);
  for (const role of [
    "sentence",
    "sentenceFurigana",
    "translation",
    "wordAudio",
    "sentenceAudio",
    "image",
  ] as const) {
    const from = bindings[role];
    if (from !== undefined)
      note.fields[noteType.bindings[role]!] = values[from]!;
  }
  const extraStart = note.fields.length - extra.length;
  extra.forEach((field, index) => {
    note.fields[extraStart + index] = field.value;
  });
  return { note, noteType };
}
