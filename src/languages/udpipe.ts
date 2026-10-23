import {
  analysisTerms,
  occurrenceGrammar,
  type AnalysisRecord,
  type AnalysisSentence,
  type Occurrence,
  type TextAnalysis,
} from "@/languages/analysis";
import { parseConllu } from "@/languages/conllu";
import { udpipeModel } from "@/languages/codes";
import { udpipePermission } from "@/languages/udpipe-permission";
import { db } from "@/platform/database/db";
import { getSettings } from "@/settings/store";

const budget = 512 * 1024;
const timeoutMs = 30_000;
const encoder = new TextEncoder();
const inFlight = new Map<string, Promise<AnalysisRecord>>();

export function analysisChunks(text: string, language: string) {
  const chunks: { text: string; start: number }[] = [];
  let start = 0;
  let current = "";
  let size = 0;
  if (encoder.encode(text).length <= budget)
    return text ? [{ text, start: 0 }] : [];
  function append(piece: string, length: number) {
    if (current && size + length > budget) {
      chunks.push({ text: current, start });
      start += current.length;
      current = "";
      size = 0;
    }
    current += piece;
    size += length;
  }
  for (const { segment } of new Intl.Segmenter(language, {
    granularity: "sentence",
  }).segment(text)) {
    const length = encoder.encode(segment).length;
    if (length <= budget) append(segment, length);
    else {
      // A sentence can exceed the service budget on pages without punctuation.
      for (const piece of segment.match(/\S+\s*|\s+/gu) || []) {
        const length = encoder.encode(piece).length;
        if (length > budget) {
          for (const character of piece) {
            append(character, encoder.encode(character).length);
          }
        } else append(piece, length);
      }
    }
  }
  if (current) chunks.push({ text: current, start });
  return chunks;
}

export async function cacheKey(text: string, language: string, model: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(JSON.stringify(["udpipe", model, "ranges", language, text])),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function processBatch(
  records: AnalysisRecord[],
  language: string,
  model: string,
) {
  const started = performance.now();
  const batch = records[0]!.key.slice(0, 8);
  const text = records.map((record) => record.text).join("\n\n");
  let sentences: AnalysisSentence[] | undefined;
  let attempted = false;
  let attempt = 0;
  for (const delay of [0, 500, 1000]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const settings = await getSettings();
    if (
      !settings.udpipe ||
      settings.paused ||
      udpipeModel(language, settings.udpipeModels[language]) !== model ||
      !(await udpipePermission())
    ) {
      console.info("[SrsReader] UDPipe request cancelled", {
        batch,
        attempt,
        enabled: settings.udpipe,
        paused: settings.paused,
        studyLanguage: settings.studyLanguage,
      });
      break;
    }
    const requestStarted = performance.now();
    attempt++;
    console.info("[SrsReader] UDPipe request started", {
      batch,
      attempt,
      delayMs: delay,
      blocks: records.length,
      characters: text.length,
      model,
      timeoutMs,
    });
    try {
      attempted = true;
      const body = new FormData();
      for (const [name, value] of Object.entries({
        model,
        tokenizer: "ranges",
        tagger: "",
        parser: "",
        output: "conllu",
      }))
        body.set(name, value);
      // Multipart string fields change LF to CRLF, which breaks token offsets.
      body.set(
        "data",
        new Blob([text], { type: "text/plain;charset=utf-8" }),
        "text.txt",
      );
      const response = await fetch(
        "https://lindat.mff.cuni.cz/services/udpipe/api/process",
        {
          method: "POST",
          body,
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      if (!response.ok) throw new Error(`UDPipe: ${response.status}`);
      const result = await response.json();
      const requestMs = Math.round(performance.now() - requestStarted);
      if (result.model !== model || typeof result.result !== "string")
        throw new Error("Invalid UDPipe response");
      sentences = parseConllu(result.result, text);
      if (!sentences.some((sentence) => sentence.tokens.length))
        throw new Error("Empty UDPipe response");
      console.info("[SrsReader] UDPipe response accepted", {
        batch,
        attempt,
        status: response.status,
        requestMs,
        parseMs: Math.round(performance.now() - requestStarted) - requestMs,
        sentences: sentences.length,
        tokens: sentences.reduce(
          (count, sentence) => count + sentence.tokens.length,
          0,
        ),
      });
      break;
    } catch (error) {
      console.warn("[SrsReader] UDPipe attempt failed", {
        batch,
        attempt,
        elapsedMs: Math.round(performance.now() - requestStarted),
        error:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error),
        nextRetryInMs: attempt === 1 ? 500 : attempt === 2 ? 1000 : null,
      });
    }
  }
  let offset = 0;
  for (const record of records) {
    if (sentences) {
      const local: AnalysisSentence[] = [];
      for (const sentence of sentences) {
        const ranged = sentence.tokens.filter(
          (token) => token.start !== undefined,
        );
        if (
          !ranged.some(
            (token) =>
              token.start! >= offset &&
              token.start! < offset + record.text.length,
          )
        )
          continue;
        if (
          ranged.some(
            (token) =>
              token.start! < offset || token.end! > offset + record.text.length,
          )
        )
          continue;
        local.push({
          metadata: sentence.metadata,
          tokens: sentence.tokens.map((token) => ({
            ...token,
            start: token.start === undefined ? undefined : token.start - offset,
            end: token.end === undefined ? undefined : token.end - offset,
          })),
        });
      }
      if (local.length)
        record.analysis = {
          sentences: local,
          surfaces: analysisTerms(local, record.text, record.key),
        };
    }
    if (!record.analysis && attempted)
      record.retryAt = Date.now() + 10 * 60 * 1000;
    offset += record.text.length + 2;
  }
  const fallback = records.filter((record) => record.retryAt);
  if (fallback.length)
    console.warn("[SrsReader] UDPipe local fallback cached", {
      batch,
      blocks: fallback.length,
      retryAt: new Date(fallback[0]!.retryAt!).toISOString(),
    });
  const storageStarted = performance.now();
  await db.analyses.bulkPut(records);
  console.info("[SrsReader] UDPipe batch finished", {
    batch,
    attempts: attempt,
    analyzedBlocks: records.filter((record) => record.analysis).length,
    fallbackBlocks: fallback.length,
    storageMs: Math.round(performance.now() - storageStarted),
    totalMs: Math.round(performance.now() - started),
  });
  return records;
}

export async function analyzeTexts(
  texts: string[],
  language: string,
  selectedModel?: string,
) {
  const model = udpipeModel(language, selectedModel);
  if (!model) return [];
  const started = performance.now();
  const chunks = texts.map((text) => analysisChunks(text, language));
  const unique = [
    ...new Set(chunks.flatMap((parts) => parts.map((part) => part.text))),
  ];
  const records = await Promise.all(
    unique.map(async (text) => ({
      key: await cacheKey(text, language, model),
      language,
      text,
    })),
  );
  const stored = await db.analyses.bulkGet(records.map((record) => record.key));
  const results = new Map<string, Promise<AnalysisRecord>>();
  const missing: AnalysisRecord[] = [];
  const complete = new Map<string, (record: AnalysisRecord) => void>();
  const reject = new Map<string, (error: unknown) => void>();
  let cacheHits = 0;
  let cachedFallbacks = 0;
  let sharedChunks = 0;
  for (const [index, record] of records.entries()) {
    const hit = stored[index];
    if (hit?.analysis || (hit?.retryAt && hit.retryAt > Date.now())) {
      if (hit.analysis) {
        cacheHits++;
        hit.analysis.surfaces = analysisTerms(
          hit.analysis.sentences,
          hit.text,
          hit.key,
        );
      } else cachedFallbacks++;
      results.set(record.text, Promise.resolve(hit));
    } else if (inFlight.has(record.key)) {
      sharedChunks++;
      results.set(record.text, inFlight.get(record.key)!);
    } else {
      const pending = new Promise<AnalysisRecord>((resolve, fail) => {
        complete.set(record.key, resolve);
        reject.set(record.key, fail);
      });
      results.set(record.text, pending);
      inFlight.set(record.key, pending);
      missing.push(record);
    }
  }
  const batches: AnalysisRecord[][] = [];
  let size = 0;
  for (const record of missing) {
    const length = encoder.encode(record.text).length;
    if (!batches.length || size + length + 2 > budget) {
      batches.push([]);
      size = 0;
    }
    batches[batches.length - 1]!.push(record);
    size += length + 2;
  }
  console.info("[SrsReader] UDPipe cache checked", {
    blocks: texts.length,
    uniqueChunks: records.length,
    cacheHits,
    cachedFallbacks,
    sharedChunks,
    missingChunks: missing.length,
    batches: batches.length,
    elapsedMs: Math.round(performance.now() - started),
  });
  for (const batch of batches) {
    void processBatch(batch, language, model)
      .then(
        (values) => {
          for (const value of values) complete.get(value.key)!(value);
        },
        (error) => {
          for (const record of batch) reject.get(record.key)!(error);
        },
      )
      .finally(() => {
        for (const record of batch) inFlight.delete(record.key);
      });
  }
  const resolved = new Map(
    await Promise.all(
      [...results].map(async ([text, result]) => [text, await result] as const),
    ),
  );
  console.info("[SrsReader] UDPipe analysis finished", {
    blocks: texts.length,
    analyzedChunks: [...resolved.values()].filter((record) => record.analysis)
      .length,
    fallbackChunks: [...resolved.values()].filter((record) => record.retryAt)
      .length,
    totalMs: Math.round(performance.now() - started),
  });
  return chunks.map((parts) => {
    const surfaces: TextAnalysis["surfaces"] = [];
    let retryAt: number | undefined;
    for (const part of parts) {
      const record = resolved.get(part.text)!;
      if (record.retryAt)
        retryAt = Math.min(retryAt ?? Infinity, record.retryAt);
      surfaces.push(
        ...(record.analysis?.surfaces || []).map((surface) => ({
          ...surface,
          start: surface.start + part.start,
          end: surface.end + part.start,
          related: surface.related?.map((range) => ({
            start: range.start + part.start,
            end: range.end + part.start,
          })),
        })),
      );
    }
    return { surfaces, retryAt };
  });
}

export async function occurrenceAnalysis(
  occurrence: Occurrence | undefined,
  surface: string,
) {
  if (!occurrence) return;
  const record = await db.analyses.get(occurrence.key);
  if (record?.text.slice(occurrence.start, occurrence.end) !== surface) return;
  const sentence = record.analysis?.sentences.find((sentence) =>
    sentence.tokens.some(
      (token) =>
        token.start === occurrence.start && token.end === occurrence.end,
    ),
  );
  if (!sentence) return;
  const token = sentence.tokens.find(
    (token) => token.start === occurrence.start && token.end === occurrence.end,
  )!;
  const analysis = analysisTerms([sentence], record.text, record.key).find(
    (item) => item.start === occurrence.start && item.end === occurrence.end,
  );
  if (!analysis) return;
  return {
    terms: [...new Set([...analysis.terms, ...(occurrence.phrases || [])])],
    grammar: occurrenceGrammar(sentence, token),
  };
}
