import {
  cacheAudioSource,
  cachePronunciation,
  findPronunciations,
} from "@/audio/playback";
import { broadcast, notify } from "@/background/events";
import { clearLookupCache, scanText } from "@/dictionaries/lookup";
import { removeRevision } from "@/dictionaries/management";
import { meaningTags, type LookupWord } from "@/dictionaries/model";
import { lookup, resolved } from "@/dictionaries/resolve";
import { languageCode } from "@/languages/codes";
import { folded } from "@/languages/text";
import { getSettings } from "@/settings/store";
import { db } from "@/shared/db";
import { t } from "@/shared/i18n/i18n";
import type { Request } from "@/shared/messages";
import { invalidateRwkv, replayBatch, rwkvStatus } from "@/srs/rwkv/runtime";
import {
  dailyCounts,
  grade,
  preview,
  rescheduleExisting,
  reviewQueue,
  undoReview,
} from "@/srs/service";
import { exampleCorpusInfo, wordExamples } from "@/vocabulary/examples/query";
import { stateOf, wordId, type ReadingContext } from "@/vocabulary/model";
import { mine, setMastered } from "@/vocabulary/service";
import { snapshot } from "@/vocabulary/snapshot";
import type { Grade } from "ts-fsrs";
import { browser } from "wxt/browser";

const sessions = new Map<string, { term: string; context?: ReadingContext }>();

function cacheAudio(word: LookupWord) {
  void getSettings()
    .then((settings) =>
      settings.audioDownloads
        ? cachePronunciation(word.language, word.lemma, word.reading)
        : null,
    )
    .catch(console.warn);
}

export async function handle(request: Request) {
  const settings = await getSettings();
  switch (request.action) {
    case "settings":
      return settings;
    case "setSettings":
      if (
        request.value.algorithm === "rwkv" &&
        settings.algorithm !== "rwkv" &&
        !(await rwkvStatus(request.value)).ready
      )
        throw new Error(t("rwkv_not_ready"));
      await db.settings.put({ id: "main", value: request.value });
      await notify();
      return request.value;
    case "dictionaries":
      return db.dictionaries.orderBy("order").toArray();
    case "setDictionary": {
      const dictionary = await db.dictionaries.get(request.id);
      if (!dictionary) throw new Error(t("dictionary_not_found"));
      await db.dictionaries.update(request.id, {
        enabled: request.enabled,
      });
      settings.dictionaryPreferences[dictionary.id] = {
        enabled: request.enabled,
        order: dictionary.order,
      };
      await db.settings.put({ id: "main", value: settings });
      await notify();
      return;
    }
    case "moveDictionary": {
      await navigator.locks.request("srs-reader-dictionary-write", () =>
        db.transaction("rw", [db.dictionaries, db.settings], async () => {
          const dictionaries = await db.dictionaries.orderBy("order").toArray();
          const index = dictionaries.findIndex(
            (dictionary) => dictionary.id === request.id,
          );
          if (index < 0) throw new Error(t("dictionary_not_found"));
          const target = index + (request.direction === "up" ? -1 : 1);
          if (target < 0 || target >= dictionaries.length) return;
          [dictionaries[index], dictionaries[target]] = [
            dictionaries[target]!,
            dictionaries[index]!,
          ];
          const currentSettings =
            (await db.settings.get("main"))?.value || settings;
          for (const [order, dictionary] of dictionaries.entries()) {
            await db.dictionaries.update(dictionary.id, { order });
            currentSettings.dictionaryPreferences[dictionary.id] = {
              enabled: dictionary.enabled,
              order,
            };
          }
          await db.settings.put({ id: "main", value: currentSettings });
        }),
      );
      await notify();
      return;
    }
    case "deleteDictionary": {
      await navigator.locks.request("srs-reader-dictionary-write", async () => {
        const dictionary = await db.dictionaries.get(request.id);
        if (!dictionary) return;
        await db.dictionaries.delete(request.id);
        await removeRevision(dictionary.revisionId);
      });
      await notify();
      return;
    }
    case "invalidate":
      await notify();
      return;
    case "scan":
      return settings.paused
        ? []
        : scanText(
            request.text,
            settings.studyLanguage,
            settings.matureIntervalDays,
          );
    case "detectLanguage": {
      const result = await browser.i18n.detectLanguage(request.text);
      const top = [...result.languages].sort(
        (a, b) => b.percentage - a.percentage,
      )[0];
      return result.isReliable &&
        top &&
        top.percentage >= 80 &&
        top.language !== "und"
        ? languageCode(top.language)
        : null;
    }
    case "saveTranslation":
      await db.vocabulary
        .where("id")
        .equals(request.id)
        .modify((word) => {
          const context = word.contexts.find(
            (c) => c.sentence === request.sentence && c.start === request.start,
          );
          if (!context) return;
          context.translation = request.translation;
          word.version++;
          word.updated = Date.now();
        });
      await notify(request.id);
      return;
    case "lookup": {
      const result = await lookup(request.term, settings);
      if (result.words.length) {
        const saved = await db.vocabulary.bulkGet(
          result.words.map((word) => word.id),
        );
        await broadcast({
          event: "parsed",
          term: request.term,
          language: settings.studyLanguage,
          candidates: result.words.map((word, index) => ({
            id: word.id,
            tags: word.meanings.flatMap(meaningTags),
            state: stateOf(saved[index], settings.matureIntervalDays),
          })),
        });
      }
      return result;
    }
    case "examples":
      return wordExamples(
        request.lemma,
        settings.studyLanguage,
        request.surface,
      );
    case "exampleCorpus":
      return exampleCorpusInfo(settings.studyLanguage);
    case "createSession": {
      const id = crypto.randomUUID();
      if (sessions.size > 100) sessions.delete(sessions.keys().next().value!);
      sessions.set(id, { term: request.term, context: request.context });
      return id;
    }
    case "session": {
      const session = sessions.get(request.id);
      if (!session)
        throw new Error(t("this_lookup_expired_hover_over_the_word_again"));
      return session;
    }
    case "word":
      return db.vocabulary.get(request.id);
    case "closeLookup":
    case "resizeLookup":
      return;
    case "mine": {
      const word = await snapshot(await resolved(request.term, request.id));
      const saved = await mine(word, request.context);
      cacheAudio(word);
      await notify(word.id);
      return saved;
    }
    case "defineWord": {
      const lemma = folded(request.term.trim(), settings.studyLanguage);
      const word: LookupWord = request.id
        ? await snapshot(await resolved(request.term, request.id))
        : {
            id: wordId(settings.studyLanguage, lemma, ""),
            lemma,
            reading: "",
            language: settings.studyLanguage,
            meanings: [],
            forms: [],
          };
      const saved = await db.transaction("rw", db.vocabulary, async () => {
        const saved = await mine(word, request.context);
        saved.meanings = [
          {
            dictionaryId: "personal",
            title: "",
            revision: "",
            attribution: "",
            sourceUrl: "",
            tags: "",
            definitions: [request.definition],
          },
          ...saved.meanings.filter(
            (meaning) => meaning.dictionaryId !== "personal",
          ),
        ];
        await db.vocabulary.put(saved);
        return saved;
      });
      await notify(saved.id);
      return saved;
    }
    case "deleteDefinition":
      await db.vocabulary
        .where("id")
        .equals(request.id)
        .modify((word) => {
          word.meanings = word.meanings.filter(
            (meaning) => meaning.dictionaryId !== "personal",
          );
          word.version++;
          word.updated = Date.now();
        });
      await notify(request.id);
      return;
    case "grade": {
      const word = await snapshot(await resolved(request.term, request.id));
      const result = await grade(
        word,
        request.rating as Grade,
        request.source,
        request.version,
        request.context,
        request.durationMs,
        request.time,
      );
      cacheAudio(word);
      await notify(word.id);
      return result;
    }
    case "known": {
      const word = await snapshot(await resolved(request.term, request.id));
      const result = await setMastered(word, request.value);
      await notify(word.id);
      return result;
    }
    case "suspend":
      await db.vocabulary
        .where("id")
        .equals(request.id)
        .modify((w) => {
          w.suspended = request.value;
          w.srsVersion++;
          w.version++;
          w.updated = Date.now();
        });
      await notify(request.id);
      return;
    case "deleteWord":
      await db.transaction(
        "rw",
        [
          db.vocabulary,
          db.reviews,
          db.audio,
          db.rwkvMeta,
          db.rwkvEntities,
          db.rwkvCards,
          db.srsMeta,
        ],
        async () => {
          await db.vocabulary.delete(request.id);
          await db.reviews.where("wordId").equals(request.id).delete();
          await db.audio.delete(request.id);
          await invalidateRwkv();
          await db.srsMeta.update("main", { undo: undefined });
        },
      );
      await notify(request.id);
      return;
    case "editWord":
      await db.vocabulary
        .where("id")
        .equals(request.id)
        .modify((w) => {
          if (request.definition)
            w.meanings = [
              {
                dictionaryId: "personal",
                title: "",
                revision: "",
                attribution: "",
                sourceUrl: "",
                tags: "",
                definitions: [request.definition],
              },
            ];
          w.contexts = request.contexts;
          w.version++;
          w.updated = Date.now();
        });
      await notify(request.id);
      return;
    case "refreshWord": {
      const saved = await db.vocabulary.get(request.id);
      if (!saved) throw new Error(t("word_not_found"));
      clearLookupCache();
      const response = await lookup(
        saved.lemma,
        {
          ...settings,
          studyLanguage: saved.language,
        },
        true,
      );
      if (response.warning) throw new Error(response.warning);
      const result = response.words.find((w) => w.id === saved.id);
      if (
        !result ||
        !result.meanings.some((meaning) => meaning.dictionaryId !== "personal")
      )
        throw new Error(
          t("no_definition_is_available_in_the_enabled_dictionaries"),
        );
      const updated = await snapshot({
        ...result,
        meanings: result.meanings.filter(
          (meaning) => meaning.dictionaryId !== "personal",
        ),
      });
      await db.vocabulary
        .where("id")
        .equals(saved.id)
        .modify((w) => {
          w.meanings = updated.meanings;
          w.version++;
          w.updated = Date.now();
        });
      await notify(saved.id);
      return;
    }
    case "undo":
      await notify(await undoReview(request.id));
      return;
    case "words":
      return (
        await db.vocabulary
          .where("language")
          .equals(settings.studyLanguage)
          .toArray()
      )
        .filter((w) =>
          folded(w.lemma, settings.studyLanguage).includes(
            folded(request.query, settings.studyLanguage),
          ),
        )
        .sort((a, b) => b.updated - a.updated);
    case "queue":
      return reviewQueue();
    case "preview":
      return preview(
        await db.vocabulary.get(request.id),
        request.durationMs,
        request.id,
      );
    case "stats": {
      const words = await db.vocabulary
        .where("language")
        .equals(settings.studyLanguage)
        .toArray();
      return {
        total: words.length,
        known: words.filter((w) => w.known).length,
        due: words.filter(
          (w) => stateOf(w, settings.matureIntervalDays) === "due",
        ).length,
        today: (await dailyCounts(settings)).today,
      };
    }
    case "resetRwkv":
      await invalidateRwkv();
      await db.srsMeta.update("main", { undo: undefined });
      return;
    case "rwkvStatus":
      return rwkvStatus(settings);
    case "prepareRwkv":
      return replayBatch(settings);
    case "activateAlgorithm": {
      if (request.algorithm === "rwkv" && !(await rwkvStatus(settings)).ready)
        throw new Error(t("rwkv_not_ready"));
      const value = { ...settings, algorithm: request.algorithm };
      await db.settings.put({ id: "main", value });
      await notify();
      return value;
    }
    case "reschedule": {
      const result = await rescheduleExisting(request.after);
      await notify();
      return result;
    }
    case "retentionOverride":
      await db.vocabulary
        .where("id")
        .equals(request.id)
        .modify((word) => {
          word.retentionOverride = request.value;
          word.srsVersion++;
          word.version++;
          word.updated = Date.now();
        });
      await notify(request.id);
      return;
    case "audioSources": {
      const [language, lemma, reading] = JSON.parse(request.id) as [
        string,
        string,
        string,
      ];
      return findPronunciations(language, lemma, reading);
    }
    case "audio": {
      if (request.source) {
        if (request.source.id !== request.id)
          throw new Error(t("invalid_audio_source"));
        const record = await cacheAudioSource(request.source);
        if (!record) throw new Error(t("audio_source_unavailable"));
        const { blob, ...info } = record;
        return info;
      }
      const saved = await db.audio.get(request.id);
      if (saved) {
        const { blob, ...info } = saved;
        return info;
      }
      if (!request.download || !settings.audioDownloads) return null;
      const word = await db.vocabulary.get(request.id);
      const identity = JSON.parse(request.id) as [string, string, string];
      const record = await cachePronunciation(
        word?.language || identity[0],
        word?.lemma || identity[1],
        word?.reading || identity[2],
      );
      if (!record) return null;
      const { blob, ...info } = record;
      return info;
    }
  }
}
