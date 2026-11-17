import { clearWordLists } from "@/vocabulary/list";
import { clearLookupCache } from "@/dictionaries/lookup";
import { scanCache } from "@/reader/cache";
import { getWord } from "@/vocabulary/storage";
import type {
  ChangeMessage,
  ChangeScope,
  RuntimeEvent,
} from "@/platform/messaging/events";
import { getSettings, refreshUISettings } from "@/settings/store";
import { stateOf, type WordStateUpdate } from "@/vocabulary/state";
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
  if (scope !== "sync") scanCache.results = new Map();
  if (!wordId) clearLookupCache();
  if (
    scope === "settings" ||
    scope === "collection" ||
    scope === "dictionaries"
  )
    await refreshUISettings().catch(console.warn);
  const word = wordId ? await getWord(wordId) : undefined;
  const matureIntervalDays = wordId
    ? (await getSettings()).matureIntervalDays
    : 0;
  const encounterStates: WordStateUpdate["encounterStates"] = {};
  for (const card of word?.linkedCards || [])
    if (
      card.encounterKey !== undefined &&
      encounterStates[card.encounterKey] === undefined
    )
      encounterStates[card.encounterKey] = stateOf(
        word,
        matureIntervalDays,
        card.encounterKey,
      );
  const message: ChangeMessage = {
    scope,
    event: "changed",
    word: wordId
      ? {
          id: wordId,
          state: stateOf(word, matureIntervalDays),
          encounterStates,
          importedCards: word?.linkedCards
            .filter((card) => card.importedGenders !== undefined)
            .map(({ importedGenders, suspended, schedule }) => ({
              importedGenders,
              suspended,
              schedule,
            })),
          hiddenDictionaries: word?.hiddenDictionaries,
          expandedDictionaries: word?.expandedDictionaries,
        }
      : undefined,
  };
  await broadcast(message);
}
