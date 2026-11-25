import { readingCard } from "@/cards/storage";
import { resolveCardEncounter } from "@/cards/encounter";
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
import { dayStart, studyDay } from "@/srs/study-day";
import { snapshot } from "@/vocabulary/snapshot";
import { getWord, mine, reviewCard } from "@/vocabulary/storage";
import { freshWord } from "@/vocabulary/service";
import type { Grade } from "ts-fsrs";
import {
  createFrequencyDeck,
  manageStudyDeck,
  studyOverview,
  saveStudyDeck,
  saveDeckReviewSettings,
} from "@/srs/decks";
import { sentenceExamples } from "@/examples/sentences";

import { queueMetadata } from "@/srs/queue-entries";

export function handleSrs(request: Request, settings: Settings) {
  return request.action === "createFrequencyDeck" ||
    request.action === "saveDeck" ||
    request.action === "saveDeckReviewSettings" ||
    request.action === "manageDeck" ||
    request.action === "grade" ||
    request.action === "undo" ||
    request.action === "bury" ||
    request.action === "preview" ||
    request.action === "resetRwkv" ||
    request.action === "prepareRwkv" ||
    request.action === "activateAlgorithm" ||
    request.action === "previewFsrsMigration" ||
    request.action === "rescheduleModel" ||
    request.action === "saveFsrsOptimization" ||
    request.action === "reschedule"
    ? srsWrite(async () => execute(request, await getSettings()))
    : execute(request, settings);
}
async function execute(request: Request, settings: Settings) {
  if (["queue", "preview", "grade"].includes(request.action))
    await requireScheduledModel(settings);
  switch (request.action) {
    case "bury": {
      const now = Date.now();
      const buriedUntil = dayStart(
        studyDay(now, settings.rolloverHour) + 1,
        settings.rolloverHour,
      );
      if (await db.cards.update(request.cardId, { buriedUntil }))
        void notify(undefined, "srs").catch(console.warn);
      return;
    }
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
    case "saveDeckReviewSettings":
      if (request.deckId === "mined") {
        if (!settings.studyLanguages.includes(request.language))
          throw new Error(t("study_deck_not_found"));
        const minedReviewSettings = { ...settings.minedReviewSettings };
        if (request.reviewSettings === null)
          delete minedReviewSettings[request.language];
        else minedReviewSettings[request.language] = request.reviewSettings;
        await saveSettings({ ...settings, minedReviewSettings });
        await notify(undefined, "settings");
        return;
      }
      await saveDeckReviewSettings(
        request.language,
        request.deckId,
        request.reviewSettings,
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
      let cardId = request.cardId || request.id;
      if (request.source === "reading") {
        const encounter = await resolveCardEncounter(
          request.context,
          request.occurrence,
        );
        const selected = await readingCard(request.id, undefined, encounter);
        if (
          (request.cardId && request.cardId !== selected?.id) ||
          (!selected && request.version !== 0)
        )
          throw new Error(t("this_word_changed_in_another_tab_reopen_it"));
        if (selected) cardId = selected.id;
        else {
          const saved = await getWord(request.id);
          if (!encounter && saved?.linkedCards.length)
            throw new Error(t("select_reading_card"));
          const term =
            request.term ?? encounter?.context.surface ?? saved?.lemma;
          if (!term) throw new Error(t("word_not_found"));
          const mined = await mine(
            await snapshot(
              await resolved(term, request.id, request.occurrence),
            ),
            encounter,
            "review",
          );
          cardId = mined.cardId!;
        }
      }
      const word = cardId ? await reviewCard(cardId) : undefined;
      if (!word || (request.source === "reading" && word.wordId !== request.id))
        throw new Error(t("card_not_found"));
      const result = await grade(
        word,
        request.rating as Grade,
        request.source,
        request.version,
        request.context,
        request.durationMs,
        request.time,
      );
      if (word.wordId) cacheAudio({ ...word, id: word.wordId, forms: [] });
      const notification = notify(
        word.wordId,
        request.source === "review" ? "srs" : "vocabulary",
      );
      if (request.source === "reading") await notification;
      else void notification.catch(console.warn);
      return result;
    }
    case "undo":
      await notify(await undoReview(request.id));
      return;
    case "queue":
      return reviewQueue(
        request.language,
        request.deckId,
        request.limits,
        request.currentCardId,
        request.previous,
      );
    case "preview": {
      const encounter = await resolveCardEncounter(
        request.context,
        request.occurrence,
      );
      const selected = encounter
        ? (await readingCard(request.id, undefined, encounter))?.id
        : request.cardId || (await readingCard(request.id))?.id || request.id;
      if (encounter && request.cardId && request.cardId !== selected)
        throw new Error(t("this_word_changed_in_another_tab_reopen_it"));
      const card = selected ? await reviewCard(selected) : undefined;
      if (
        request.version !== undefined &&
        request.version !== (card?.srsVersion ?? 0)
      )
        throw new Error(t("this_word_changed_in_another_tab_reopen_it"));
      if (card) return preview(card, request.durationMs);
      if (request.cardId) throw new Error(t("card_not_found"));
      const word = await getWord(request.id, encounter);
      if (!encounter && word?.linkedCards.length)
        throw new Error(t("select_reading_card"));
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
      return reviewStatistics(settings, request);
    case "stats": {
      const languages = await Promise.all(
        settings.studyLanguages.map(queueMetadata),
      );
      const overview = await studyOverview(settings);
      return {
        total: languages.reduce((sum, lang) => sum + lang.total, 0),
        known: languages.reduce((sum, lang) => sum + lang.known, 0),
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
    case "saveFsrsOptimization": {
      if (
        settings.algorithm !== "fsrs" ||
        settings.fsrsVersion !== request.model.version ||
        settings.rolloverHour !== request.rolloverHour
      )
        throw new Error(t("srs_fsrs_optimization_settings_changed"));
      const value = { ...settings, fsrsOptimization: request.model };
      await saveSettings(value);
      await notify(undefined, "settings");
      return value;
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
