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
  const heading =
    '<div class="srs-word">{{#SrsArticle}}<span class="srs-article">{{SrsArticle}}</span> {{/SrsArticle}}{{Word}}</div>{{#SrsShowPartOfSpeech}}{{#SrsPartOfSpeech}}<div class="srs-pos">{{SrsPartOfSpeech}}</div>{{/SrsPartOfSpeech}}{{/SrsShowPartOfSpeech}}';
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
        front: `{{#SrsSentenceFront}}{{#Sentence}}<div class="srs-prompt">{{Sentence}}</div>{{/Sentence}}{{^Sentence}}${heading}{{/Sentence}}{{/SrsSentenceFront}}{{^SrsSentenceFront}}${heading}{{/SrsSentenceFront}}{{#Image}}<div class="srs-image">{{Image}}</div>{{/Image}}`,
        back: `{{FrontSide}}{{#SrsSentenceFront}}{{#Sentence}}${heading}{{/Sentence}}{{/SrsSentenceFront}}{{#Reading}}<div class="srs-reading">{{Reading}}</div>{{/Reading}}<hr id="answer"><div class="srs-answer">{{#SrsForms}}<section class="srs-study-section"><h3>{{SrsFormsLabel}}</h3>{{SrsForms}}</section>{{/SrsForms}}{{#SrsIpa}}<section class="srs-study-section"><h3>{{SrsIpaLabel}}</h3><div>{{SrsIpa}}</div></section>{{/SrsIpa}}{{#Sentence}}<section class="srs-study-section">{{^SrsSentenceFront}}<h3>{{SrsExamplesLabel}}</h3><div class="srs-sentence">{{Sentence}}</div>{{/SrsSentenceFront}}{{#SrsGrammar}}<div class="srs-pos" data-srs-grammar>{{SrsGrammar}}</div>{{/SrsGrammar}}{{#Translation}}<div class="srs-translation">{{Translation}}</div>{{/Translation}}</section>{{/Sentence}}{{^Sentence}}{{#Translation}}<div class="srs-translation">{{Translation}}</div>{{/Translation}}{{/Sentence}}<div class="srs-definitions">{{Definitions}}</div><div>{{WordAudio}}{{SentenceAudio}}</div>${extraTemplate}</div>`,
      },
    ],
    css:
      ".card{position:relative;isolation:isolate;min-height:12rem;font-family:var(--mantine-font-family,sans-serif);overflow-wrap:anywhere;text-align:start;line-height:1.5}.srs-word,.srs-prompt{text-align:center;font-size:clamp(1.75rem,6vw,2.5rem);font-weight:600}.srs-article{font-weight:400;color:var(--mantine-color-dimmed)}.srs-pos,.srs-reading,.srs-translation{text-align:center;color:var(--mantine-color-dimmed)}.srs-pos,.srs-study-section h3{font-size:var(--mantine-font-size-xs,.75rem);font-weight:500}.srs-pos{margin-top:var(--mantine-spacing-xs,.5rem)}.srs-answer{display:grid;gap:var(--mantine-spacing-md,1rem)}.srs-definitions{min-width:0}.srs-study-section{text-align:center}.srs-study-section h3{margin:0 0 var(--mantine-spacing-xs,.5rem);color:var(--mantine-color-dimmed)}.srs-forms{display:flex;justify-content:center;flex-wrap:wrap;gap:var(--mantine-spacing-xs,.5rem) var(--mantine-spacing-md,1rem);margin:0}.srs-forms>div{display:flex;flex-wrap:wrap;justify-content:center;gap:.35em}.srs-forms dt{color:var(--mantine-color-dimmed)}.srs-forms dd{margin:0}.srs-sentence,.srs-extra{margin-block:var(--mantine-spacing-xs,.5rem)}.srs-image{position:absolute;inset:0;z-index:-1;overflow:hidden;pointer-events:none;mask-image:linear-gradient(to bottom,black 28%,transparent 100%);opacity:.3}.srs-image img,.srs-image video{display:block;width:100%;height:auto}img,video{max-width:100%}audio{max-width:100%}hr{margin-block:var(--mantine-spacing-md,1rem);border:0;border-top:1px solid var(--mantine-color-default-border)}" +
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
