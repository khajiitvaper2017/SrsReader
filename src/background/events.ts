import { clearLookupCache } from "@/dictionaries/lookup";
import { getSettings } from "@/settings/store";
import { db } from "@/shared/db";
import { stateOf } from "@/vocabulary/model";
import { browser } from "wxt/browser";

export async function broadcast(message: unknown) {
  void browser.runtime.sendMessage(message).catch(() => {});
  for (const tab of await browser.tabs.query({}))
    if (tab.id) void browser.tabs.sendMessage(tab.id, message).catch(() => {});
}

export async function notify(wordId?: string) {
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
  await broadcast(message);
}
