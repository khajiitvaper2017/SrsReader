import { analyzeTexts } from "@/languages/udpipe";
import { udpipePermission } from "@/languages/udpipe-permission";
import { scanTexts } from "@/reader/scan";
import type { Request } from "@/reader/contracts";
import type { Settings } from "@/settings/model";

export const handleReader = execute;
async function execute(request: Request, settings: Settings) {
  switch (request.action) {
    case "scan": {
      if (settings.paused) return request.texts.map(() => ({ spans: [] }));
      const started = performance.now();
      const udpipeAllowed =
        settings.udpipe &&
        settings.studyLanguage === "cs" &&
        (await udpipePermission());
      console.info("[SrsReader] Background scan started", {
        blocks: request.texts.length,
        characters: request.texts.reduce(
          (count, text) => count + text.length,
          0,
        ),
        studyLanguage: settings.studyLanguage,
        udpipeEnabled: settings.udpipe,
        udpipeAllowed,
      });
      const analyses = udpipeAllowed
        ? await analyzeTexts(request.texts).catch((error) => {
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
      const spans = await scanTexts(
        request.texts,
        settings.studyLanguage,
        settings.matureIntervalDays,
        analyses.map((analysis) => analysis.surfaces),
      );
      const results = spans.map((spans, index) => ({
        spans,
        retryAt: analyses[index]?.retryAt,
      }));
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
