import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import type { Grade } from "ts-fsrs";
import { requestSchema, type Request } from "../src/api";
import { cachePronunciation } from "../src/audio";
import { db } from "../src/db";
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
    "lookup",
    "createSession",
  ]);
  async function notify() {
    clearLookupCache();
    void browser.runtime.sendMessage({ event: "changed" }).catch(() => {});
    for (const tab of await browser.tabs.query({}))
      if (tab.id)
        void browser.tabs
          .sendMessage(tab.id, { event: "changed" })
          .catch(() => {});
  }
  async function resolved(term: string, id: string): Promise<LookupWord> {
    const settings = await getSettings();
    const match = (await lookupMany([term], settings.language))
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
    throw new Error("This word has no dictionary definition.");
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
        if (!dictionary) throw new Error("Dictionary not found.");
        await db.dictionaries.update(request.id, {
          enabled: request.enabled ?? dictionary.enabled,
          order: request.order ?? dictionary.order,
        });
        settings.dictionaryPreferences[dictionary.id] = {
          enabled: request.enabled ?? dictionary.enabled,
          order: request.order ?? dictionary.order,
        };
        await db.settings.put({ id: "main", value: settings });
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
        return settings.paused ? [] : scanText(request.text, settings.language);
      case "lookup":
        return (
          (await lookupMany([request.term], settings.language)).get(
            normalize(request.term),
          ) || { words: [], unresolved: [] }
        );
      case "createSession": {
        const id = crypto.randomUUID();
        if (sessions.size > 100) sessions.delete(sessions.keys().next().value!);
        sessions.set(id, { term: request.term, context: request.context });
        return id;
      }
      case "session": {
        const session = sessions.get(request.id);
        if (!session)
          throw new Error("This lookup expired. Hover over the word again.");
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
        await notify();
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
        await notify();
        return result;
      }
      case "known": {
        const word = await snapshot(await resolved(request.term, request.id));
        const result = await setMastered(word, request.value);
        await notify();
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
        await notify();
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
        await notify();
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
                  title: "Personal definition",
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
        await notify();
        return;
      case "refreshWord": {
        const saved = await db.vocabulary.get(request.id);
        if (!saved) throw new Error("Word not found.");
        clearLookupCache();
        const result = (await lookupMany([saved.lemma], saved.language))
          .get(saved.lemma)
          ?.words.find((w) => w.id === saved.id);
        if (!result)
          throw new Error(
            "No definition is available in the enabled dictionaries.",
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
        await notify();
        return;
      }
      case "undo":
        await undoReview(request.id);
        await notify();
        return;
      case "words":
        return (
          await db.vocabulary
            .where("language")
            .equals(settings.language)
            .toArray()
        )
          .filter((w) =>
            folded(w.lemma, settings.language).includes(
              folded(request.query, settings.language),
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
          .equals(settings.language)
          .toArray();
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        return {
          total: words.length,
          known: words.filter((w) => w.known).length,
          due: words.filter((w) => stateOf(w) === "due").length,
          today: await db.reviews
            .where("time")
            .aboveOrEqual(midnight.getTime())
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
        error: "This action is only available inside SrsReader.",
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
