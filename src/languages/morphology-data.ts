import { morphologyLanguage } from "@/languages/codes";
import { normalize } from "@/languages/text";
import { db } from "@/shared/db";
import { readDownload } from "@/shared/download";
import { t } from "@/shared/i18n/i18n";
import type { ExampleProgress } from "@/vocabulary/examples/example-corpus";
import { XzReadableStream } from "xz-decompress";

// Simplemma's SMFC1 data format is pinned together with its decoder.
const revision = "4a5d20a8428bbc8b4cd1faacfaf3b178b0f84257";

function decodeForms(data: Uint8Array) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const invalid = () => new Error(t("invalid_word_form_data"));
  let pos = 5;
  const byte = () => {
    if (pos >= data.length) throw invalid();
    return data[pos++]!;
  };
  const integer = () => {
    let value = 0;
    for (let shift = 0; shift <= 28; shift += 7) {
      const current = byte();
      value += (current & 127) * 2 ** shift;
      if (!(current & 128)) return value;
    }
    throw invalid();
  };
  const suffix = (prefix: Uint8Array, shared: number, size: number) => {
    if (shared > prefix.length || pos + size > data.length) throw invalid();
    const result = new Uint8Array(shared + size);
    result.set(prefix.subarray(0, shared));
    result.set(data.subarray(pos, pos + size), shared);
    pos += size;
    return result;
  };
  if (decoder.decode(data.subarray(0, 5)) !== "SMFC1") throw invalid();
  const flags = byte();
  if (flags > 1) throw invalid();
  const count = integer();
  const rows: [string, string][] = [];
  let key: Uint8Array = new Uint8Array();
  let value: Uint8Array = new Uint8Array();
  for (let i = 0; i < count; i++) {
    key = suffix(key, integer(), integer());
    const trim = byte();
    if (trim !== 254) {
      if (trim !== 255 && trim > key.length) throw invalid();
      value = suffix(key, trim === 255 ? 0 : key.length - trim, integer());
    }
    const form = decoder.decode(flags ? key.slice().reverse() : key);
    const lemma = decoder.decode(flags ? value.slice().reverse() : value);
    if (!form || !lemma) throw invalid();
    rows.push([normalize(form), normalize(lemma)]);
  }
  if (pos !== data.length || !count) throw invalid();
  return rows;
}

export async function installMorphology(
  language: string,
  progress: (value: ExampleProgress) => void,
) {
  const source = morphologyLanguage(language);
  if (!source)
    throw new Error(t("no_additional_word_form_data_is_available_for"));
  progress({ phase: t("downloading_word_forms"), done: 0, total: 0 });
  const response = await fetch(
    `https://raw.githubusercontent.com/adbar/simplemma/${revision}/simplemma/strategies/dictionaries/data/${source}.plzma`,
    { credentials: "omit" },
  );
  if (!response.ok)
    throw new Error(
      t("word_form_download_failed", { status: response.status }),
    );
  const blob = await readDownload(
    response,
    t("downloading_word_forms"),
    progress,
  );
  progress({ phase: t("reading_word_forms"), done: 0, total: 0 });
  const data = new Uint8Array(
    await new Response(new XzReadableStream(blob.stream())).arrayBuffer(),
  );
  const rows = decodeForms(data);
  const compressed = new Blob([JSON.stringify(rows)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  await db.morphology.put({
    language,
    count: rows.length,
    data: await new Response(compressed).blob(),
    updated: Date.now(),
  });
  return rows.length;
}
