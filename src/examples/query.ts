import type { Corpus, Example, ExamplesResult } from "@/examples/model";
import { languageCode } from "@/languages/codes";
import { analyzeWords } from "@/languages/morphology";
import { folded } from "@/languages/text";
import { db } from "@/platform/database/db";

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
  surface: string,
): Promise<ExamplesResult> {
  language = languageCode(language);
  const corpus = await getCorpus(language);
  if (!corpus) return { installed: false, examples: [] };
  const segmenter = new Intl.Segmenter(language, { granularity: "word" });
  const query = [...segmenter.segment(lemma)]
    .filter((word) => word.isWordLike)
    .map((word) => folded(word.segment, language));
  const key = folded(lemma, language);
  const surfaceQuery = [...segmenter.segment(surface)]
    .filter((word) => word.isWordLike)
    .map((word) => folded(word.segment, language));
  const reflexive =
    language === "cs" && query.length === 2 && /^(se|si)$/u.test(query[1]!);
  const findMatch = (words: string[], tokens: string[]) => {
    if (!tokens.length) return;
    if (!reflexive) {
      const start = words.findIndex((_, i) =>
        tokens.every((token, j) => words[i + j] === token),
      );
      return start < 0 ? undefined : tokens.map((_, i) => start + i);
    }
    const matched: number[] = [];
    for (const token of tokens) {
      const index = words.findIndex(
        (word, i) => word === token && !matched.includes(i),
      );
      if (index < 0) return;
      matched.push(index);
    }
    return matched.sort((a, b) => a - b);
  };
  const surfaceFirst = surfaceQuery[0] || folded(surface, language);
  const preferred: number[] = [];
  for (let position = 0; position < corpus.sentences.length; position++) {
    const sentence = corpus.sentences[position]![1];
    if (!folded(sentence, language).includes(surfaceFirst)) continue;
    const words = [...segmenter.segment(sentence)].filter(
      (word) => word.isWordLike,
    );
    if (
      findMatch(
        words.map((word) => folded(word.segment, language)),
        surfaceQuery,
      )
    )
      preferred.push(position);
    if (preferred.length === 8) break;
  }
  const reflexiveAnalyses =
    reflexive && preferred.length < 8
      ? await analyzeWords(Object.keys(corpus.index), language)
      : undefined;
  const positions = new Set([
    ...preferred,
    ...(reflexive
      ? corpus.sentences.keys()
      : [
          ...(corpus.index[key] || []),
          ...(corpus.index[query[0] || key] || []),
        ]),
  ]);
  const result: Example[] = [];
  for (const position of positions) {
    const [id, sentence, author] = corpus.sentences[position]!;
    const words = [...segmenter.segment(sentence)].filter(
      (word) => word.isWordLike,
    );
    const foldedWords = words.map((word) => folded(word.segment, language));
    const surfaceMatch = findMatch(foldedWords, surfaceQuery);
    if (reflexive && !surfaceMatch && !foldedWords.includes(query[1]!))
      continue;
    let match = surfaceMatch;
    if (!match) {
      if (reflexive) {
        match = findMatch(
          foldedWords.map((word) =>
            /^(se|si)$/u.test(word)
              ? word
              : folded(reflexiveAnalyses?.get(word) || word, language).replace(
                  / (se|si)$/u,
                  "",
                ),
          ),
          query,
        );
      } else {
        match = findMatch(foldedWords, query);
        if (!match && query.length === 1) {
          const analyses = await analyzeWords(
            words.map((word) => word.segment),
            language,
          );
          match = findMatch(
            words.map((word) =>
              folded(analyses.get(word.segment) || word.segment, language),
            ),
            query,
          );
        }
      }
    }
    if (!match) continue;
    const start = words[match[0]!]!.index;
    const last = words[match[match.length - 1]!]!;
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
    if (result.length === 8) break;
  }
  return { installed: true, examples: result };
}
