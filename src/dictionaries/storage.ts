import { isOnlineDictionary, onlineDictionaries } from "@/dictionaries/online";
import { dictionaryDisplay } from "@/dictionaries/display";
import { immersionDictionary } from "@/dictionaries/immersion";
import { immersionId } from "@/dictionaries/immersion-model";
import type { Request } from "@/dictionaries/contracts";
import { removeRevision } from "@/dictionaries/management";
import { db } from "@/platform/database/db";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { getSettings, saveSettings } from "@/settings/store";
import type { Dictionary } from "@/dictionaries/model";

export async function setDictionaryDisplay(
  request: Extract<Request, { action: "setDictionary" }>,
  settings: Settings,
) {
  const dictionary = (await listDictionaries(settings)).find(
    (dictionary) => dictionary.id === request.id,
  );
  if (!dictionary) throw new Error(t("dictionary_not_found"));
  const enabled = request.display !== "hide";
  if (request.role === "vocabulary") {
    if (request.id === "nechybujte") settings.nechybujte = enabled;
    else if (!isOnlineDictionary(request.id))
      await db.dictionaries.update(request.id, { enabled });
  }
  const preferences =
    request.role === "frequency"
      ? settings.frequencyPreferences
      : settings.dictionaryPreferences;
  const preference = {
    enabled,
    order: preferences[dictionary.id]?.order ?? dictionary.order,
  };
  if (request.role === "frequency")
    settings.frequencyPreferences[dictionary.id] = preference;
  else
    settings.dictionaryPreferences[dictionary.id] = {
      ...preference,
      fallback: request.display === "fallback",
    };
  await saveSettings(settings);
  return;
}
export async function reorderDictionary(
  request: Extract<Request, { action: "moveDictionary" }>,
  settings: Settings,
) {
  await navigator.locks.request("srs-reader-dictionary-write", () =>
    db.transaction("rw", [db.dictionaries, db.settings], async () => {
      const all = await listDictionaries(settings);
      const source = all.find((dictionary) => dictionary.id === request.id);
      const targetDictionary = all.find(
        (dictionary) => dictionary.id === request.target,
      );
      if (
        !source ||
        !targetDictionary ||
        source.language !== targetDictionary.language
      )
        throw new Error(t("dictionary_not_found"));
      const dictionaries = (
        request.role === "frequency"
          ? await listFrequencyDictionaries(settings)
          : all.filter(
              (dictionary) =>
                dictionary.count > 0 || isOnlineDictionary(dictionary.id),
            )
      ).filter((dictionary) => dictionary.language === source.language);
      const index = dictionaries.findIndex(
        (dictionary) => dictionary.id === request.id,
      );
      const target = dictionaries.findIndex(
        (dictionary) => dictionary.id === request.target,
      );
      if (index < 0 || target < 0) throw new Error(t("dictionary_not_found"));
      const [dictionary] = dictionaries.splice(index, 1);
      dictionaries.splice(target, 0, dictionary!);
      const currentSettings =
        (await db.settings.get("main"))?.value || settings;
      for (const [order, dictionary] of dictionaries.entries()) {
        if (request.role === "vocabulary" && !isOnlineDictionary(dictionary.id))
          await db.dictionaries.update(dictionary.id, { order });
        const preference = { enabled: dictionary.enabled, order };
        if (request.role === "frequency")
          currentSettings.frequencyPreferences[dictionary.id] = preference;
        else
          currentSettings.dictionaryPreferences[dictionary.id] = {
            ...preference,
            fallback:
              currentSettings.dictionaryPreferences[dictionary.id]?.fallback ??
              isOnlineDictionary(dictionary.id),
          };
      }
      await saveSettings(currentSettings);
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
    if (dictionary.immersion) {
      await db.transaction(
        "rw",
        [db.dictionaries, db.immersionWords, db.immersionPassages],
        async () => {
          await db.immersionWords
            .where("dictionaryId")
            .equals(dictionary.id)
            .delete();
          await db.immersionPassages
            .where("dictionaryId")
            .equals(dictionary.id)
            .delete();
          await db.dictionaries.delete(dictionary.id);
        },
      );
      return;
    }
    await db.dictionaries.delete(request.id);
    await removeRevision(dictionary.revisionId);
  });
  return;
}

export const loadDictionaries = (ids: string[]) => db.dictionaries.bulkGet(ids);
export async function listDictionaries(settings?: Settings) {
  settings ??= await getSettings();
  const dictionaries = await db.dictionaries.orderBy("order").toArray();
  const languages = new Set([
    ...settings.studyLanguages,
    ...dictionaries.map((dictionary) => dictionary.language),
  ]);
  for (const language of languages) {
    if (
      !dictionaries.some(
        (dictionary) => dictionary.id === immersionId(language),
      )
    )
      dictionaries.push({
        ...immersionDictionary(language),
        order: (dictionaries.at(-1)?.order ?? -1) + 1,
      });
  }
  const online: Dictionary[] = onlineDictionaries.map(
    ({ id, language, target }, index) => ({
      id,
      revisionId: id,
      language,
      target,
      index: { title: t(`${id}_online`), format: 3, revision: "" },
      enabled: dictionaryDisplay(id, settings) !== "hide",
      order:
        settings.dictionaryPreferences[id]?.order ??
        (dictionaries.at(-1)?.order ?? -1) + index + 1,
      count: 0,
      frequencyCount: 0,
      maxFrequency: 0,
      imported: 0,
      styles: "",
    }),
  );
  return [
    ...dictionaries.map((dictionary) =>
      dictionary.immersion
        ? {
            ...dictionary,
            index: { ...dictionary.index, title: t("immersion_frequency") },
          }
        : dictionary,
    ),
    ...online,
  ].sort((a, b) => a.order - b.order);
}
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

export async function listFrequencyDictionaries(settings?: Settings) {
  settings ??= await getSettings();
  const preferences = settings.frequencyPreferences;
  return (await listDictionaries(settings))
    .filter(
      (dictionary) => dictionary.frequencyCount > 0 || dictionary.immersion,
    )
    .map((dictionary) => ({
      ...dictionary,
      enabled: preferences[dictionary.id]?.enabled !== false,
      order: preferences[dictionary.id]?.order ?? dictionary.order,
    }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
