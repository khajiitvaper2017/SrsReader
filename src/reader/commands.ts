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
async function execute(request: Request, settings: Settings) {
  switch (request.action) {
    case "scan": {
      if (!settings.studyLanguages.includes(request.language))
        return request.texts.map(() => ({
          language: request.language,
          spans: [],
        }));
      const started = performance.now();
      const udpipeAllowed =
        settings.udpipe &&
        !!udpipeModel(request.language) &&
        (await udpipePermission());
      console.info("[SrsReader] Background scan started", {
        blocks: request.texts.length,
        characters: request.texts.reduce(
          (count, text) => count + text.length,
          0,
        ),
        studyLanguage: request.language,
        udpipeEnabled: settings.udpipe,
        udpipeAllowed,
      });
      const analyses = udpipeAllowed
        ? await analyzeTexts(
            request.texts,
            request.language,
            settings.udpipeModels[request.language],
          ).catch((error) => {
            console.warn("SrsReader: contextual analysis unavailable", error);
            return request.texts.map(() => ({
              surfaces: [],
              retryAt: Date.now() + 10 * 60 * 1000,
            }));
          })
        : [];
      const analysisMs = Math.round(performance.now() - started);
      console.info("[SrsReader] Analysis finished", {
        elapsedMs: analysisMs,
        blocksWithUDPipeAnnotations: analyses.filter(
          (analysis) => analysis.surfaces.length,
        ).length,
        localFallbackBlocks: analyses.filter((analysis) => analysis.retryAt)
          .length,
      });
      const dictionaryStarted = performance.now();
      const immersion =
        request.source === "website" &&
        settings.frequencyPreferences[immersionId(request.language)]
          ?.enabled !== false;
      const parsed = await scanTexts(
        request.texts,
        request.language,
        settings,
        analyses.map((analysis) => analysis.surfaces),
        immersion,
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
          console.warn("SrsReader: immersion counts could not be saved", error);
        }
      }
      const results = spans.map((spans, index) => ({
        language: request.language,
        spans,
        retryAt: analyses[index]?.retryAt,
      }));
      await cacheScannedTexts(request.texts, spans, request.language);
      console.info("[SrsReader] Background scan finished", {
        blocks: results.length,
        words: results.reduce(
          (count, result) => count + result.spans.length,
          0,
        ),
        analysisMs,
        dictionaryMs: Math.round(performance.now() - dictionaryStarted),
        totalMs: Math.round(performance.now() - started),
      });
      return results;
    }
  }
}
