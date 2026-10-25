import { clearWordLists } from "@/vocabulary/list";
import { clearLookupCache } from "@/dictionaries/lookup";
import { db } from "@/platform/database/db";
import type {
  ChangeMessage,
  ChangeScope,
  RuntimeEvent,
} from "@/platform/messaging/events";
import { getSettings } from "@/settings/store";
import { stateOf } from "@/vocabulary/model";
import { browser } from "wxt/browser";

export async function broadcast(message: RuntimeEvent) {
  void browser.runtime.sendMessage(message).catch(() => {});
  for (const tab of await browser.tabs.query({}))
    if (tab.id) void browser.tabs.sendMessage(tab.id, message).catch(() => {});
}

export async function notify(
  wordId?: string,
  scope: ChangeScope = wordId ? "vocabulary" : "collection",
) {
  clearWordLists();
  if (!wordId) clearLookupCache();
  const word = wordId ? await db.vocabulary.get(wordId) : undefined;
  const message: ChangeMessage = {
    scope,
    event: "changed",
    word: wordId
      ? {
          id: wordId,
          state: stateOf(word, (await getSettings()).matureIntervalDays),
          hiddenDictionaries: word?.hiddenDictionaries,
          expandedDictionaries: word?.expandedDictionaries,
        }
      : undefined,
  };
  await broadcast(message);
}
