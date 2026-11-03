import { logScanWarning, type ScanWarning } from "@/platform/messaging/events";
import { immersionId } from "@/dictionaries/immersion-model";
import { recordImmersion } from "@/dictionaries/immersion";
import { broadcast } from "@/background/events";
import { analyzeTexts } from "@/languages/udpipe";
import { udpipePermission } from "@/languages/udpipe-permission";
import { udpipeModel } from "@/languages/codes";
import { scanTexts } from "@/reader/scan";
import type { Request } from "@/reader/contracts";
import type { Settings } from "@/settings/model";
import { cacheScannedTexts } from "@/examples/sentences";

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
      const immersion =
        request.source === "website" &&
        settings.frequencyPreferences[immersionId(request.language)]
          ?.enabled !== false;
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
      const parsed = await scanTexts(
        request.texts,
        request.language,
        settings,
        analyses.map((analysis) => analysis.surfaces),
        immersion,
        request.lookup,
        warn,
        dictionary,
        async (index, spans) => {
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
          await cacheScannedTexts(
            [request.texts[index]!],
            [spans],
            request.language,
          );
        },
      );
      const storageStarted = performance.now();
      const spans = parsed.map((result) => result.spans);
      if (immersion) {
        try {
          if (
            await recordImmersion(
              request.language,
              request.texts,
              parsed.map((result) => result.lemmas),
            )
          )
            await broadcast({ event: "changed", scope: "frequency" });
        } catch (error) {
          warn("Immersion counts could not be saved", { error: String(error) });
        }
      }
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
