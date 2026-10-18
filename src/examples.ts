import { db } from "./db";
import { folded, type ReadingContext } from "./model";
import { analyzeWords } from "./morphology";
import { languageCode } from "./languages";
import type { Corpus } from "./example-corpus";

export type Example = { id: number; author: string; context: ReadingContext };
export type ExamplesResult = { installed: boolean; examples: Example[] };
let cached:
  { language: string; revision: number; value: Promise<Corpus> } | undefined;

async function loadCorpus(blob: Blob): Promise<Corpus> {
  const corpus: Corpus = await new Response(
    blob.stream().pipeThrough(new DecompressionStream("gzip")),
  ).json();
  Object.setPrototypeOf(corpus.index, null);
  return corpus;
}

async function getCorpus(language: string) {
  language = languageCode(language);
  const saved = await db.exampleCorpora.get(language);
  if (!saved) return;
  if (cached?.language !== language || cached.revision !== saved.updated)
    cached = {
      language,
      revision: saved.updated,
      value: loadCorpus(saved.corpus),
    };
  return cached.value;
}

export async function exampleCorpusInfo(language: string) {
  if (!language) return { count: 0, installed: false };
  const corpus = await getCorpus(language);
  return { count: corpus?.sentences.length || 0, installed: !!corpus };
}

export async function wordExamples(
  lemma: string,
  language: string,
): Promise<ExamplesResult> {
  language = languageCode(language);
  const corpus = await getCorpus(language);
  if (!corpus) return { installed: false, examples: [] };
  const segmenter = new Intl.Segmenter(language, { granularity: "word" });
  const query = [...segmenter.segment(lemma)]
    .filter((word) => word.isWordLike)
    .map((word) => folded(word.segment, language));
  const key = folded(lemma, language);
  const positions = new Set([
    ...(corpus.index[key] || []),
    ...(corpus.index[query[0] || key] || []),
  ]);
  const result: Example[] = [];
  for (const position of positions) {
    const [id, sentence, author] = corpus.sentences[position]!;
    const words = [...segmenter.segment(sentence)].filter(
      (word) => word.isWordLike,
    );
    const analyses = await analyzeWords(
      words.map((word) => word.segment),
      language,
    );
    const match = words.findIndex((word, i) =>
      query.length > 1
        ? query.every(
            (token, j) =>
              words[i + j] && folded(words[i + j]!.segment, language) === token,
          )
        : folded(word.segment, language) === key ||
          folded(analyses.get(word.segment) || word.segment, language) === key,
    );
    if (match < 0) continue;
    const start = words[match]!.index;
    const last = words[match + Math.max(1, query.length) - 1]!;
    const end = last.index + last.segment.length;
    result.push({
      id,
      author,
      context: {
        sentence,
        surface: sentence.slice(start, end),
        start,
        end,
        url: `https://tatoeba.org/en/sentences/show/${id}`,
        title: `Tatoeba · ${author}`,
        mined: 0,
      },
    });
  }
  return { installed: true, examples: result.slice(0, 8) };
}
