import type { Note, NoteType } from "@/cards/model";
import { definitionsHtml } from "@/cards/snapshot";
import type { ReadingContext, Vocabulary } from "@/vocabulary/model";

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

const baseFields = [
  "Word",
  "Reading",
  "Definitions",
  "Sentence",
  "SentenceFurigana",
  "Translation",
  "WordAudio",
  "SentenceAudio",
  "Image",
  "Examples",
];
export type CustomField = { name: string; value: string };
export const readerLayoutCss =
  ".srs-sentence,.srs-definitions>[data-srs-pos]{text-align:center}";

export function readerNoteType(customFields: CustomField[] = []): NoteType {
  const used = new Set(baseFields);
  const extra = customFields.map(({ name }) => {
    const clean = name.replace(/[{}:]|\p{Cc}/gu, " ").trim() || "Field";
    let unique = clean;
    for (let suffix = 2; used.has(unique); suffix++)
      unique = `${clean} ${suffix}`;
    used.add(unique);
    return { name: unique, ...(unique === name ? {} : { label: name }) };
  });
  const extraTemplate = extra
    .map(
      (field) =>
        `{{#${field.name}}}<section class="srs-extra"><h3>${escapeHtml(field.label ?? field.name)}</h3>{{${field.name}}}</section>{{/${field.name}}}`,
    )
    .join("\n");
  return {
    id: `reader:${JSON.stringify(extra)}`,
    name: "SrsReader",
    kind: "standard",
    fields: [...baseFields.map((name) => ({ name })), ...extra],
    bindings: {
      word: 0,
      reading: 1,
      definitions: 2,
      sentence: 3,
      sentenceFurigana: 4,
      translation: 5,
      wordAudio: 6,
      sentenceAudio: 7,
      image: 8,
    },
    templates: [
      {
        name: "Recognition",
        front:
          '{{#SrsSentenceFront}}{{#Sentence}}<div class="srs-prompt">{{Sentence}}</div>{{/Sentence}}{{^Sentence}}<div class="srs-word">{{Word}}</div>{{/Sentence}}{{/SrsSentenceFront}}{{^SrsSentenceFront}}<div class="srs-word">{{Word}}</div>{{/SrsSentenceFront}}{{#Image}}<div class="srs-image">{{Image}}</div>{{/Image}}',
        back: `{{FrontSide}}<hr id="answer">{{#SrsSentenceFront}}<div class="srs-word">{{Word}}</div>{{/SrsSentenceFront}}{{#Reading}}<div class="srs-reading">{{Reading}}</div>{{/Reading}}{{^SrsSentenceFront}}{{#Sentence}}<div class="srs-sentence">{{Sentence}}</div>{{/Sentence}}{{/SrsSentenceFront}}{{#Translation}}<div class="srs-translation">{{Translation}}</div>{{/Translation}}<div>{{WordAudio}}{{SentenceAudio}}</div><div class="srs-definitions">{{Definitions}}</div>${extraTemplate}`,
      },
    ],
    css:
      ".card{position:relative;isolation:isolate;min-height:12rem;font-family:var(--mantine-font-family, sans-serif);overflow-wrap:anywhere;text-align:start;line-height:1.5}.srs-word,.srs-prompt{text-align:center;font-size:1.5em;font-weight:600}.srs-reading,.srs-translation{text-align:center;color:var(--mantine-color-dimmed)}.srs-sentence,.srs-definitions,.srs-extra{margin-block:var(--mantine-spacing-sm, .75rem)}.srs-image{position:absolute;inset:0;z-index:-1;overflow:hidden;pointer-events:none;mask-image:linear-gradient(to bottom,black 28%,transparent 100%);opacity:.3}.srs-image img,.srs-image video{display:block;width:100%;height:auto}img,video{max-width:100%}audio{max-width:100%}hr{border:0;border-top:1px solid var(--mantine-color-default-border)}" +
      readerLayoutCss,
    created: 0,
  };
}

type WordContent = Pick<
  Vocabulary,
  "id" | "language" | "lemma" | "reading" | "meanings" | "created" | "updated"
>;
export function readerNote(
  word: WordContent,
  context?: ReadingContext,
  customFields: CustomField[] = [],
  nativeLanguage?: string,
) {
  const noteType = readerNoteType(customFields);
  const note: Note = {
    id: word.id,
    noteTypeId: noteType.id,
    language: word.language,
    fields: [
      escapeHtml(word.lemma),
      escapeHtml(word.reading),
      definitionsHtml(word.meanings),
      escapeHtml(context?.sentence ?? ""),
      "",
      escapeHtml(
        (nativeLanguage
          ? context?.customTranslations?.[nativeLanguage]
          : undefined) ??
          context?.translation?.text ??
          "",
      ),
      "",
      "",
      "",
      "",
      ...customFields.map((field) =>
        escapeHtml(field.value).replace(/\n/g, "<br>"),
      ),
    ],
    tags: [],
    wordId: word.id,
    mediaNamespace: word.id,
    version: 0,
    created: word.created,
    updated: word.updated,
  };
  return { note, noteType };
}
