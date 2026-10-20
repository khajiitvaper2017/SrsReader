import { languageCode, languageIso3, languageName } from "@/languages/codes";
import { analyzeWords } from "@/languages/morphology";
import { folded } from "@/languages/text";
import { db } from "@/platform/database/db";
import type { ImportProgress } from "@/shared/download";
import { readDownload } from "@/shared/download";
import { t } from "@/shared/i18n/i18n";
import bzip2 from "bzip2";

export type Corpus = {
  sentences: [number, string, string][];
  index: Record<string, number[]>;
};
export type ExampleProgress = ImportProgress;

export async function installExampleCorpus(
  language: string,
  blob: Blob | undefined,
  progress: (value: ExampleProgress) => void,
) {
  language = languageCode(language);
  if (!blob) {
    const iso3 = languageIso3(language);
    if (!iso3)
      throw new Error(
        t("no_tatoeba_download_is_listed_for_import_a", {
          value1: languageName(language),
        }),
      );
    progress({ phase: t("downloading_examples"), done: 0, total: 0 });
    const response = await fetch(
      `https://downloads.tatoeba.org/exports/per_language/${iso3}/${iso3}_sentences_detailed.tsv.bz2`,
      { credentials: "omit" },
    );
    if (!response.ok)
      throw new Error(
        t("example_download_failed", { status: response.status }),
      );
    blob = await readDownload(response, t("downloading_examples"), progress);
  }
  progress({ phase: t("reading_examples"), done: 0, total: 0 });
  const corpus: Corpus = { sentences: [], index: Object.create(null) };
  const seen = new Set<string>();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "";
  function accept(text: string) {
    pending += text;
    const lines = pending.split("\n");
    pending = lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      const [id, code, sentence, author] = line.split("\t");
      if (
        !id ||
        !code ||
        !sentence ||
        !author ||
        !Number.isSafeInteger(Number(id)) ||
        Number(id) <= 0
      )
        throw new Error(
          t("import_tatoeba_s_detailed_tsv_export_with_sentence"),
        );
      if (
        languageCode(code) !== language ||
        author === "\\N" ||
        seen.has(sentence) ||
        sentence.length < 4 ||
        sentence.length > 220
      )
        continue;
      seen.add(sentence);
      corpus.sentences.push([Number(id), sentence.normalize("NFC"), author]);
    }
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes[0] === 66 && bytes[1] === 90 && bytes[2] === 104) {
    const bits = bzip2.array(bytes);
    const size = bzip2.header(bits);
    for (;;) {
      const chunk = bzip2.decompress(bits, size);
      if (chunk === -1) break;
      accept(decoder.decode(chunk, { stream: true }));
      progress({
        phase: t("reading_examples"),
        done: corpus.sentences.length,
        total: 0,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    accept(decoder.decode());
  } else accept(decoder.decode(bytes));
  accept("\n");
  if (!corpus.sentences.length)
    throw new Error(
      t("no_attributed_sentences_were_found_in_this_file", {
        value1: languageName(language),
      }),
    );
  corpus.sentences.sort(
    (a, b) =>
      Math.abs(a[1].length - 65) - Math.abs(b[1].length - 65) || a[0] - b[0],
  );
  const segmenter = new Intl.Segmenter(language, { granularity: "word" });
  for (let position = 0; position < corpus.sentences.length; position++) {
    const words = [...segmenter.segment(corpus.sentences[position]![1])]
      .filter((word) => word.isWordLike)
      .map((word) => word.segment);
    const analyses = await analyzeWords(words, language);
    const keys = new Set(
      words.flatMap((word) => [
        folded(word, language),
        folded(analyses.get(word) || word, language),
      ]),
    );
    for (const key of keys) {
      const matches = (corpus.index[key] ??= []);
      if (matches.length < 8) matches.push(position);
    }
    if (position % 1000 === 0) {
      progress({
        phase: t("indexing_examples"),
        done: position,
        total: corpus.sentences.length,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  progress({
    phase: t("saving_examples"),
    done: corpus.sentences.length,
    total: corpus.sentences.length,
  });
  const compressed = await new Response(
    new Blob([JSON.stringify(corpus)])
      .stream()
      .pipeThrough(new CompressionStream("gzip")),
  ).blob();
  await db.exampleCorpora.put({
    language,
    corpus: compressed,
    count: corpus.sentences.length,
    updated: Date.now(),
  });
  return corpus.sentences.length;
}
