import { parseHTML } from "linkedom";
import { readerNote } from "@/cards/defaults";
import type { FieldBindings } from "@/cards/model";
import { germanNounField } from "@/cards/noun-article";
import { prepareDictionarySnapshot } from "@/cards/snapshot";
import { lookup } from "@/dictionaries/resolve";
import { db } from "@/platform/database/db";
import type { Settings } from "@/settings/model";
import { applyDefinitionOverrides } from "@/vocabulary/definitions";
import { wordId, type Vocabulary } from "@/vocabulary/model";
import { freshWord } from "@/vocabulary/service";

function plain(value: string, reading = false) {
  const { document } = parseHTML(`<html><body>${value}</body></html>`);
  document
    .querySelectorAll("script,style")
    .forEach((element) => element.remove());
  for (const ruby of document.querySelectorAll("ruby")) {
    if (reading)
      ruby.replaceWith(
        ruby.querySelector("rt")?.textContent ?? ruby.textContent ?? "",
      );
    else ruby.querySelectorAll("rt,rp").forEach((element) => element.remove());
  }
  return (document.body.textContent ?? "")
    .replace(/\[sound:[^\]]*\]/g, "")
    .replace(/ ?([^ >]+?)\[(?!sound:)(.+?)\]/g, reading ? "$2" : "$1")
    .trim();
}

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
    ? (await lookup(lemma, settings)).words.find(
        (word) =>
          word.lemma.normalize() === lemma.normalize() &&
          word.reading.normalize() === reading.normalize(),
      )
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

export async function convertedAnkiNote(
  word: Vocabulary,
  fields: { name: string }[],
  values: string[],
  bindings: FieldBindings,
  namespace: string,
) {
  const mapped = new Set(Object.values(bindings));
  const extra = fields.flatMap((field, index) =>
    mapped.has(index) ? [] : [{ name: field.name, value: values[index]! }],
  );
  const lemma =
    word.language === "de" ? germanNounField(word.lemma).lemma : word.lemma;
  const { note, noteType } = readerNote({ ...word, lemma }, undefined, extra);
  const snapshot = await prepareDictionarySnapshot(
    { ...word, meanings: applyDefinitionOverrides(word.meanings, word) },
    { namespace },
  );
  note.mediaNamespace = namespace;
  note.fields[noteType.bindings.definitions!] = snapshot.html;
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
  return { note, noteType, assets: snapshot.assets };
}
