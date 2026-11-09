import { logScanWarning, type ScanWarning } from "@/platform/messaging/events";
import { broadcast } from "@/background/events";
import { analyzeTexts } from "@/languages/udpipe";
import { udpipePermission } from "@/languages/udpipe-permission";
import { udpipeModel } from "@/languages/codes";
import { scanTexts } from "@/reader/scan";
import type { Request } from "@/reader/contracts";
import { scanCache } from "@/reader/cache";
import type { Settings } from "@/settings/model";
import { cacheScannedTexts } from "@/examples/sentences";
import { getWords } from "@/vocabulary/storage";
import { stateOf } from "@/vocabulary/model";

export const handleReader = execute;
async function execute(
  request: Request,
  settings: Settings,
  warn: ScanWarning = logScanWarning,
) {
  switch (request.action) {
    case "scan": {
      if (!settings.studyLanguages.includes(request.language))
        return {
          results: request.texts.map(() => ({
            language: request.language,
            spans: [],
          })),
        };
      const cache = scanCache.results;
      const key = JSON.stringify([
        request.language,
        request.lookup,
        request.texts,
        settings,
      ]);
      const cached = cache.get(key);
      if (
        cached &&
        cached.every((result) => !result.retryAt || result.retryAt > Date.now())
      ) {
        const ids = [
          ...new Set(
            cached.flatMap((result) =>
              result.spans.flatMap((span) => span.ids),
            ),
          ),
        ];
        const words = new Map(
          (await getWords(ids))
            .filter((word) => word !== undefined)
            .map((word) => [word.id, word]),
        );
        for (const result of cached)
          for (const span of result.spans) {
            for (const candidate of span.candidates)
              candidate.state = stateOf(
                words.get(candidate.id),
                settings.matureIntervalDays,
              );
            span.state = span.candidates[0]?.state ?? "unparsed";
          }
        return { results: cached };
      }
      cache.delete(key);
      const started = performance.now();
      const udpipeAllowed =
        settings.udpipe &&
        !!udpipeModel(request.language) &&
        (await udpipePermission());
      const udp = { httpWorkMs: 0, requests: 0, cacheHits: 0, sharedChunks: 0 };
      const analysisStarted = performance.now();
      const analyses = udpipeAllowed
        ? await analyzeTexts(
            request.texts,
            request.language,
            settings.udpipeModels[request.language],
            udp,
            warn,
          ).catch((error) => {
            warn("Contextual analysis unavailable", { error: String(error) });
            return request.texts.map(() => ({
              surfaces: [],
              retryAt: Date.now() + 10 * 60 * 1000,
            }));
          })
        : [];
      const udpipeMs = udpipeAllowed ? performance.now() - analysisStarted : 0;
      const dictionaryStarted = performance.now();
      const dictionary = {
        dictionaryListMs: 0,
        segmentMs: 0,
        phraseQueryMs: 0,
        phraseRows: 0,
        phraseDatabaseRows: 0,
        phraseMatchMs: 0,
        termLookupMs: 0,
        entryQueryMs: 0,
        entryQueries: 0,
        savedWordQueryMs: 0,
        wordStateMs: 0,
        buildSpansMs: 0,
      };
      const spans = await scanTexts(
        request.texts,
        request.language,
        settings,
        analyses.map((analysis) => analysis.surfaces),
        request.lookup,
        warn,
        dictionary,
        async (index, spans) => {
          if (cache !== scanCache.results) return;
          await broadcast({
            event: "scanResult",
            session: request.session,
            text: request.texts[index]!,
            result: {
              language: request.language,
              spans,
              retryAt: analyses[index]?.retryAt,
            },
          });
          if (cache !== scanCache.results) return;
          await cacheScannedTexts(
            [request.texts[index]!],
            [spans],
            request.language,
          );
        },
        (completed) => {
          if (cache !== scanCache.results) return;
          if (cache.size >= 64) cache.delete(cache.keys().next().value!);
          cache.set(
            key,
            completed.map((spans, index) => ({
              language: request.language,
              spans,
              retryAt: analyses[index]?.retryAt,
            })),
          );
        },
      );
      const storageStarted = performance.now();
      const results = spans.map((spans, index) => ({
        language: request.language,
        spans,
        retryAt: analyses[index]?.retryAt,
      }));
      await cacheScannedTexts(request.texts, spans, request.language);
      return {
        results,
        timing: {
          workerMs: performance.now() - started,
          udpipeMs,
          udpipeHttpWorkMs: udp.httpWorkMs,
          udpipeRequests: udp.requests,
          udpipeCacheHits: udp.cacheHits,
          udpipeSharedChunks: udp.sharedChunks,
          udpipeFallbackBlocks: analyses.filter((analysis) => analysis.retryAt)
            .length,
          dictionaryMs: storageStarted - dictionaryStarted,
          ...dictionary,
          storageMs: performance.now() - storageStarted,
        },
      };
    }
  }
}
