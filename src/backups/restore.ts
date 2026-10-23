import { immersionDictionary } from "@/dictionaries/immersion";
import { saveSettings } from "@/settings/store";
import { readLearning } from "@/backups/archive";
import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import { settingsSchema } from "@/settings/model";
import { srsClient } from "@/srs/client";
import { invalidateRwkv } from "@/srs/engines/rwkv/storage";

export async function restoreSettings(
  settings: ReturnType<typeof settingsSchema.parse>,
) {
  await srsWrite(() =>
    db.transaction("rw", [db.settings, db.dictionaries], async () => {
      const current = (await db.settings.get("main"))?.value;
      await saveSettings({
        ...settings,
        algorithm: current?.algorithm ?? "fsrs",
      });
      for (const [id, preference] of Object.entries(
        settings.dictionaryPreferences,
      ))
        await db.dictionaries.update(id, {
          enabled: preference.enabled,
          order: preference.order,
        });
    }),
  );
  if (settings.algorithm === "rwkv") {
    while (!(await srsClient({ action: "rwkvStatus" })).ready)
      await srsClient({ action: "prepareRwkv" });
  }
  await srsClient({
    action: "activateAlgorithm",
    algorithm: settings.algorithm,
  });
}

export async function restoreLearning(
  data: Awaited<ReturnType<typeof readLearning>>,
) {
  await srsWrite(() =>
    db.transaction(
      "rw",
      [
        db.vocabulary,
        db.reviews,
        db.audio,
        db.decks,
        db.sentences,
        db.dictionaries,
        db.settings,
        db.immersionWords,
        db.immersionPassages,
        db.srsMeta,
        db.rwkvMeta,
        db.rwkvEntities,
        db.rwkvCards,
      ],
      async () => {
        const settings = settingsSchema.parse(
          (await db.settings.get("main"))?.value || {},
        );
        await db.dictionaries
          .filter((dictionary) => !!dictionary.immersion)
          .delete();
        await db.immersionWords.clear();
        await db.immersionPassages.clear();
        let order =
          ((await db.dictionaries.orderBy("order").last())?.order ?? -1) + 1;
        for (const source of data.immersion) {
          const dictionary = immersionDictionary(
            source.language,
            source.secondaryWeight,
          );
          dictionary.order =
            settings.frequencyPreferences[dictionary.id]?.order ?? order++;
          dictionary.frequencyCount = source.words.length;
          dictionary.maxFrequency = source.words.length;
          settings.frequencyPreferences[dictionary.id] ??= {
            enabled: true,
            order: dictionary.order,
          };
          await db.dictionaries.add(dictionary);
          await db.immersionWords.bulkAdd(source.words);
          await db.immersionPassages.bulkAdd(source.passages);
        }
        await saveSettings(settings);
        await invalidateRwkv();
        await db.srsMeta.put({
          id: "main",
          sequence: data.reviews.reduce(
            (max, review) => Math.max(max, review.sequence),
            0,
          ),
        });
        await db.vocabulary.clear();
        await db.reviews.clear();
        await db.audio.clear();
        await db.decks.clear();
        await db.sentences.clear();
        await db.vocabulary.bulkAdd(data.vocabulary);
        await db.reviews.bulkAdd(data.reviews);
        await db.audio.bulkAdd(data.audio);
        await db.decks.bulkAdd(data.decks);
        await db.sentences.bulkAdd(data.sentences);
      },
    ),
  );
}
