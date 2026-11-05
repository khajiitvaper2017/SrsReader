import { ensureReaderCard, readingCard } from "@/cards/storage";
import { cacheAudio } from "@/audio/cache";
import { notify } from "@/background/events";
import { resolved } from "@/dictionaries/resolve";
import { srsWrite } from "@/platform/locks";
import { db } from "@/platform/database/db";
import type { Settings } from "@/settings/model";
import { getSettings, saveSettings } from "@/settings/store";
import { t } from "@/shared/i18n/i18n";
import { preview } from "@/srs/answers";
import type { Request } from "@/srs/contracts";
import { rwkvStatus } from "@/srs/engines/rwkv/cache";
import { replayBatch } from "@/srs/engines/rwkv/replay";
import { invalidateRwkv } from "@/srs/engines/rwkv/storage";
import { grade } from "@/srs/grading";
import { reviewQueue } from "@/srs/queue";
import {
  previewFsrsMigration,
  requireScheduledModel,
  rescheduleExisting,
  rescheduleModel,
} from "@/srs/reschedule";
import { reviewStatistics } from "@/srs/statistics";
import { clearUndo } from "@/srs/storage";
import { undoReview } from "@/srs/undo";
import { dailyCounts } from "@/srs/workload";
import { snapshot } from "@/vocabulary/snapshot";
import { getWord, languageWords, mine, reviewCard } from "@/vocabulary/storage";
import { freshWord } from "@/vocabulary/service";
import type { Grade } from "ts-fsrs";
import {
  createFrequencyDeck,
  manageStudyDeck,
  studyOverview,
  saveStudyDeck,
} from "@/srs/decks";
import { sentenceExamples } from "@/examples/sentences";

export function handleSrs(request: Request, settings: Settings) {
  return request.action === "createFrequencyDeck" ||
    request.action === "saveDeck" ||
    request.action === "manageDeck" ||
    request.action === "grade" ||
    request.action === "undo" ||
    request.action === "preview" ||
    request.action === "resetRwkv" ||
    request.action === "prepareRwkv" ||
    request.action === "activateAlgorithm" ||
    request.action === "previewFsrsMigration" ||
    request.action === "rescheduleModel" ||
    request.action === "reschedule"
    ? srsWrite(async () => execute(request, await getSettings()))
    : execute(request, settings);
}
async function execute(request: Request, settings: Settings) {
  if (["queue", "preview", "grade"].includes(request.action))
    await requireScheduledModel(settings);
  switch (request.action) {
    case "studyOverview":
      return studyOverview(settings);
    case "saveDeck":
      await saveStudyDeck(
        request.language,
        request.name,
        request.parentId,
        request.id,
      );
      await notify(undefined, "collection");
      return;
    case "manageDeck":
      await manageStudyDeck(
        request.language,
        request.deckId,
        request.operation,
      );
      await notify(undefined, "collection");
      return;
    case "createFrequencyDeck": {
      const deck = await createFrequencyDeck(
        request.dictionaryId,
        request.limit,
        request.name,
      );
      await notify(undefined, "collection");
      return deck;
    }
    case "sentenceExamples": {
      const word = await db.vocabulary.get(request.id);
      return word ? sentenceExamples(word) : [];
    }
    case "grade": {
      let cardId =
        request.cardId ||
        (request.source === "review"
          ? request.id
          : (await readingCard(request.id))?.id);
      let created = false;
      if (request.source === "reading" && !cardId) {
        let saved = await getWord(request.id);
        if (saved?.linkedCards.length)
          throw new Error(t("select_reading_card"));
        if (!saved) {
          if (!request.term) throw new Error(t("word_not_found"));
          saved = await mine(
            await snapshot(
              await resolved(request.term, request.id, request.occurrence),
            ),
            request.context,
          );
          created = true;
        }
        cardId = (await ensureReaderCard(saved, request.context)).id;
      }
      const word = cardId ? await reviewCard(cardId) : undefined;
      if (!word || (request.source === "reading" && word.wordId !== request.id))
        throw new Error(t("card_not_found"));
      const result = await grade(
        word,
        request.rating as Grade,
        request.source,
        created ? word.srsVersion : request.version,
        request.context,
        request.durationMs,
        request.time,
      );
      if (word.wordId) cacheAudio({ ...word, id: word.wordId, forms: [] });
      await notify(
        word.wordId,
        request.source === "review" ? "srs" : "vocabulary",
      );
      return result;
    }
    case "undo":
      await notify(await undoReview(request.id));
      return;
    case "queue":
      return reviewQueue(request.language, request.deckId, request.limits);
    case "preview": {
      const selected =
        request.cardId || (await readingCard(request.id))?.id || request.id;
      const card = await reviewCard(selected);
      if (card) return preview(card, request.durationMs);
      const word = await getWord(request.id);
      if (word?.linkedCards.length) throw new Error(t("select_reading_card"));
      if (word) return preview(word, request.durationMs);
      const [language, lemma, reading] = JSON.parse(request.id) as [
        string,
        string,
        string,
      ];
      return preview(
        {
          ...freshWord({
            id: request.id,
            language,
            lemma,
            reading,
            meanings: [],
            forms: [],
          }),
          card: null,
          retentionOverride: null,
        },
        request.durationMs,
      );
    }
    case "reviewStats":
      return reviewStatistics(settings, request.year);
    case "stats": {
      const words = (
        await Promise.all(settings.studyLanguages.map(languageWords))
      ).flat();
      const overview = await studyOverview(settings);
      return {
        total: words.length,
        known: words.filter((w) => w.known).length,
        due: overview.reduce(
          (sum, language) =>
            sum + language.fresh + language.learning + language.due,
          0,
        ),
        today: (
          await Promise.all(
            settings.studyLanguages.map((language) =>
              dailyCounts({ ...settings, studyLanguage: language }),
            ),
          )
        ).reduce((sum, counts) => sum + counts.today, 0),
      };
    }
    case "resetRwkv":
      await invalidateRwkv();
      await clearUndo();
      return;
    case "rwkvStatus":
      return rwkvStatus(settings);
    case "prepareRwkv":
      return replayBatch(settings);
    case "previewFsrsMigration":
      return previewFsrsMigration(request.version);
    case "activateAlgorithm": {
      if (request.algorithm === "rwkv" && !(await rwkvStatus(settings)).ready)
        throw new Error(t("rwkv_not_ready"));
      const value = {
        ...settings,
        algorithm: request.algorithm,
        fsrsVersion: request.fsrsVersion ?? settings.fsrsVersion,
        rwkvMode: request.rwkvMode ?? settings.rwkvMode,
      };
      await saveSettings(value);
      await notify(undefined, "settings");
      return value;
    }
    case "rescheduleModel": {
      const result = await rescheduleModel();
      if (result.cursor === null) await notify(undefined, "srs");
      return result;
    }
    case "reschedule": {
      const result = await rescheduleExisting(
        request.after,
        false,
        request.language,
        request.deckId,
      );
      await notify(undefined, "srs");
      return result;
    }
  }
}
