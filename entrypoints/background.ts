import { t } from "../src/i18n";
import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import type { Grade } from "ts-fsrs";
import { requestSchema, type Request } from "../src/api";
import { cachePronunciation } from "../src/audio";
import { db } from "../src/db";
import { languageCode } from "../src/languages";
import { wordExamples, exampleCorpusInfo } from "../src/examples";
import { removeRevision } from "../src/dictionaries";
import { clearLookupCache, lookupMany, scanText } from "../src/lookup";
import {
  folded,
  normalize,
  stateOf,
  type LookupWord,
  type ReadingContext,
} from "../src/model";
import {
  setMastered,
  getSettings,
  grade,
  mine,
  preview,
  reviewQueue,
  undoReview,
} from "../src/srs";

export default defineBackground(() => {
  const sessions = new Map<
    string,
    { term: string; context?: ReadingContext }
  >();
  const reads = new Set([
    "settings",
    "dictionaries",
    "scan",
    "detectLanguage",
    "lookup",
    "createSession",
  ]);
  async function notify(wordId?: string) {
    if (!wordId) clearLookupCache();
    const message = {
      event: "changed",
      word: wordId
        ? {
            id: wordId,
            state: stateOf(
              await db.vocabulary.get(wordId),
              (await getSettings()).matureIntervalDays,
            ),
          }
        : undefined,
    };
    void browser.runtime.sendMessage(message).catch(() => {});
    for (const tab of await browser.tabs.query({}))
      if (tab.id)
        void browser.tabs.sendMessage(tab.id, message).catch(() => {});
  }
  async function resolved(term: string, id: string): Promise<LookupWord> {
    const settings = await getSettings();
    const match = (await lookupMany([term], settings.studyLanguage))
      .get(normalize(term))
      ?.words.find((w) => w.id === id);
    if (match) return match;
    const saved = await db.vocabulary.get(id);
    if (saved)
      return {
        id: saved.id,
        lemma: saved.lemma,
        reading: saved.reading,
        language: saved.language,
        meanings: saved.meanings,
        forms: [],
      };
    throw new Error(t("this_word_has_no_dictionary_definition"));
  }
  async function snapshot(word: LookupWord) {
    const copy = structuredClone(word);
    const dictionaries = await db.dictionaries.toArray();
    async function embed(value: unknown, revisionId: string): Promise<void> {
      if (Array.isArray(value)) {
        for (const item of value) await embed(item, revisionId);
      } else if (value && typeof value === "object") {
        const node = value as Record<string, unknown>;
        if (
          (node.type === "image" || node.tag === "img") &&
          typeof node.path === "string"
        ) {
          const media = await db.dictionaryMedia.get(
            `${revisionId}:${node.path}`,
          );
          if (media) {
            const bytes = new Uint8Array(await media.blob.arrayBuffer());
            let binary = "";
            for (let i = 0; i < bytes.length; i += 8192)
              binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
            const extension = node.path.split(".").pop()?.toLowerCase();
            const mime = (
              {
                png: "image/png",
                jpg: "image/jpeg",
                jpeg: "image/jpeg",
                gif: "image/gif",
                webp: "image/webp",
                svg: "image/svg+xml",
                avif: "image/avif",
              } as Record<string, string>
            )[extension || ""];
            if (mime) node.path = `data:${mime};base64,${btoa(binary)}`;
          }
        }
        for (const child of Object.values(node))
          if (typeof child === "object") await embed(child, revisionId);
      }
    }
    for (const meaning of copy.meanings) {
      const dictionary = dictionaries.find(
        (d) => d.id === meaning.dictionaryId,
      );
      if (dictionary) await embed(meaning.definitions, dictionary.revisionId);
    }
    return copy;
  }
  function cacheAudio(word: LookupWord) {
    void getSettings()
      .then((settings) =>
        settings.audioDownloads
          ? cachePronunciation(word.language, word.lemma, word.reading)
          : null,
      )
      .catch(console.warn);
  }
  async function handle(request: Request) {
    const settings = await getSettings();
    switch (request.action) {
      case "settings":
        return settings;
      case "setSettings":
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
            const dictionaries = await db.dictionaries
              .orderBy("order")
              .toArray();
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
        await navigator.locks.request(
          "srs-reader-dictionary-write",
          async () => {
            const dictionary = await db.dictionaries.get(request.id);
            if (!dictionary) return;
            await db.dictionaries.delete(request.id);
            await removeRevision(dictionary.revisionId);
          },
        );
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
              (c) =>
                c.sentence === request.sentence && c.start === request.start,
            );
            if (!context) return;
            context.translation = request.translation;
            word.version++;
            word.updated = Date.now();
          });
        await notify(request.id);
        return;
      case "lookup":
        return (
          (await lookupMany([request.term], settings.studyLanguage)).get(
            normalize(request.term),
          ) || { words: [], unresolved: [] }
        );
      case "examples":
        return wordExamples(request.lemma, settings.studyLanguage);
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
      case "grade": {
        const word = await snapshot(await resolved(request.term, request.id));
        const result = await grade(
          word,
          request.rating as Grade,
          request.source,
          request.version,
          request.context,
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
            w.version++;
            w.updated = Date.now();
          });
        await notify(request.id);
        return;
      case "deleteWord":
        await db.transaction(
          "rw",
          [db.vocabulary, db.reviews, db.audio],
          async () => {
            await db.vocabulary.delete(request.id);
            await db.reviews.where("wordId").equals(request.id).delete();
            await db.audio.delete(request.id);
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
        const result = (await lookupMany([saved.lemma], saved.language))
          .get(saved.lemma)
          ?.words.find((w) => w.id === saved.id);
        if (!result)
          throw new Error(
            t("no_definition_is_available_in_the_enabled_dictionaries"),
          );
        const updated = await snapshot(result);
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
        return preview(await db.vocabulary.get(request.id));
      case "stats": {
        const words = await db.vocabulary
          .where("language")
          .equals(settings.studyLanguage)
          .toArray();
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        return {
          total: words.length,
          known: words.filter((w) => w.known).length,
          due: words.filter(
            (w) => stateOf(w, settings.matureIntervalDays) === "due",
          ).length,
          today: await db.reviews
            .where("time")
            .aboveOrEqual(midnight.getTime())
            .filter(
              (review) =>
                JSON.parse(review.wordId)[0] === settings.studyLanguage,
            )
            .count(),
        };
      }
      case "audio": {
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
  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    const parsed = requestSchema.safeParse(message);
    if (!parsed.success) return undefined;
    const fromExtensionPage =
      sender.id === browser.runtime.id &&
      !!sender.url?.startsWith(browser.runtime.getURL("/"));
    if (!fromExtensionPage && !reads.has(parsed.data.action))
      return Promise.resolve({
        error: t("this_action_is_only_available_inside_srsreader"),
      });
    if (parsed.data.action === "closeLookup" && sender.tab?.id)
      void browser.tabs.sendMessage(sender.tab.id, { event: "closeLookup" });
    if (parsed.data.action === "resizeLookup" && sender.tab?.id)
      void browser.tabs.sendMessage(sender.tab.id, {
        event: "resizeLookup",
        session: parsed.data.session,
        height: parsed.data.height,
      });
    return handle(parsed.data).then(
      (value) => ({ value }),
      (error) => ({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  });
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install")
      void browser.windows.create({
        url: browser.runtime.getURL("/app.html") + "#setup",
        type: "popup",
        width: 760,
        height: 760,
      });
  });
});
