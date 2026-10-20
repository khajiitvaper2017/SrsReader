import type { Request } from "@/dictionaries/contracts";
import { removeRevision } from "@/dictionaries/management";
import { db } from "@/platform/database/db";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";

export async function setDictionaryEnabled(
  request: Extract<Request, { action: "setDictionary" }>,
  settings: Settings,
) {
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
  return;
}
export async function reorderDictionary(
  request: Extract<Request, { action: "moveDictionary" }>,
  settings: Settings,
) {
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
  return;
}
export async function deleteDictionary(
  request: Extract<Request, { action: "deleteDictionary" }>,
) {
  await navigator.locks.request("srs-reader-dictionary-write", async () => {
    const dictionary = await db.dictionaries.get(request.id);
    if (!dictionary) return;
    await db.dictionaries.delete(request.id);
    await removeRevision(dictionary.revisionId);
  });
  return;
}

export const loadDictionaries = (ids: string[]) => db.dictionaries.bulkGet(ids);
export const listDictionaries = () =>
  db.dictionaries.orderBy("order").toArray();
export const dictionaryTags = (revisions: string[]) =>
  db.tags.where("revisionId").anyOf(revisions).toArray();
export const dictionaryArchive = (revision: string) =>
  db.archives.get(revision);
export async function dictionaryImage(id: string, path: string) {
  const dictionary = await db.dictionaries.get(id);
  return dictionary
    ? db.dictionaryMedia.get(dictionary.revisionId + ":" + path)
    : undefined;
}
