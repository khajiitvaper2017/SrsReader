import Dexie, { type DBCoreTransaction } from "dexie";
import { browser } from "wxt/browser";
import { db } from "@/platform/database/db";
import { learningResetTables } from "@/backups/reset-scope";
import { settingsSchema } from "@/settings/model";
import { portableSettings } from "@/sync/settings";
import { mediaKey, type MediaTable } from "@/sync/model";

type Change = {
  suppressed: number;
  generation?: number;
  mediaChanged?: boolean;
  tail: Promise<unknown>;
};
const changes = new WeakMap<DBCoreTransaction, Change>();
const tracked = new Set<string>([...learningResetTables, "settings"]);

function stateFor(trans: DBCoreTransaction) {
  let state = changes.get(trans);
  if (!state) {
    state = { suppressed: 0, tail: Dexie.Promise.resolve() };
    changes.set(trans, state);
    const change = state;
    (trans as IDBTransaction).addEventListener(
      "complete",
      () => {
        if (change.generation !== undefined)
          void browser?.runtime
            ?.sendMessage({ action: "syncEdited" })
            .catch(() => {});
      },
      { once: true },
    );
  }
  return state;
}

export async function withoutSyncTracking<T>(work: () => Promise<T>) {
  const trans = Dexie.currentTransaction?.idbtrans;
  if (!trans)
    throw new Error("Sync application requires a database transaction");
  const state = stateFor(trans);
  state.suppressed++;
  try {
    return await work();
  } finally {
    state.suppressed--;
  }
}

export const stagedAnkiMediaId = "staged-anki-media";

export async function discardStagedAnkiMedia() {
  const stage = await db.syncMeta.get(stagedAnkiMediaId);
  if (typeof stage?.namespace !== "string") return;
  const namespace = stage.namespace;
  await db.transaction(
    "rw",
    [db.cardAssets, db.syncMedia, db.syncMeta],
    async () => {
      const ids = await db.cardAssets
        .where("namespace")
        .equals(namespace)
        .primaryKeys();
      await withoutSyncTracking(() => db.cardAssets.bulkDelete(ids));
      await db.syncMedia.bulkDelete(
        ids.map((id) => mediaKey("cardAssets", id)),
      );
      await db.syncMeta.delete(stagedAnkiMediaId);
    },
  );
}

export async function deleteLearningRecords() {
  await discardStagedAnkiMedia();
  for (const table of learningResetTables) await db[table].clear();
}

export async function localVersions() {
  const row = await db.syncMeta.get("collection-generation");
  return {
    generation: Number(row?.generation ?? 0),
    mediaGeneration: Number(row?.mediaGeneration ?? 0),
  };
}

export function installSyncTracking(database: Dexie) {
  database.use({
    stack: "dbcore",
    name: "sync-tracking",
    level: -2,
    create(core) {
      if (!core.schema.tables.some(({ name }) => name === "syncMedia"))
        return {};
      const meta = core.table("syncMeta");
      const media = core.table("syncMedia");
      return {
        transaction(stores, mode, options) {
          return core.transaction(
            mode === "readwrite" && stores.some((name) => tracked.has(name))
              ? [...new Set([...stores, "syncMeta", "syncMedia"])]
              : stores,
            mode,
            options,
          );
        },
        table(name) {
          const table = core.table(name);
          if (!tracked.has(name)) return table;
          const mediaTable =
            name === "audio" || name === "cardAssets" ? name : undefined;
          return {
            ...table,
            mutate(request) {
              const { trans } = request;
              if ((trans as IDBTransaction).mode === "versionchange")
                return table.mutate(request);
              const state = stateFor(trans);
              if (state.suppressed) return table.mutate(request);
              const work = state.tail.then(async () => {
                const oldSettings =
                  name === "settings"
                    ? await table.get({ trans, key: "main" })
                    : undefined;
                const removed =
                  mediaTable && request.type === "deleteRange"
                    ? (
                        await media.query({
                          trans,
                          values: false,
                          query: {
                            index: media.schema.indexes.find(
                              ({ name }) => name === "table",
                            )!,
                            range: {
                              type: 1,
                              lower: mediaTable,
                              upper: mediaTable,
                            },
                          },
                        })
                      ).result.filter((key: string) => {
                        const [, id] = JSON.parse(key) as [MediaTable, string];
                        return (
                          (request.range.lower === undefined ||
                            indexedDB.cmp(id, request.range.lower) >=
                              (request.range.lowerOpen ? 1 : 0)) &&
                          (request.range.upper === undefined ||
                            indexedDB.cmp(id, request.range.upper) <=
                              (request.range.upperOpen ? -1 : 0))
                        );
                      })
                    : [];
                const result = await table.mutate(request);
                if (name === "settings") {
                  const next = await table.get({ trans, key: "main" });
                  const portable = (row: { value?: unknown } | undefined) =>
                    JSON.stringify(
                      portableSettings(settingsSchema.parse(row?.value ?? {})),
                    );
                  if (portable(oldSettings) === portable(next)) return result;
                }
                const keys =
                  ("keys" in request && request.keys) ||
                  ("values" in request
                    ? request.values.map((value) =>
                        table.schema.primaryKey.extractKey!(value),
                      )
                    : []);
                if (
                  request.type !== "deleteRange" &&
                  !keys.some((_, i) => !result.failures[i])
                )
                  return result;
                if (
                  state.generation === undefined ||
                  (mediaTable && !state.mediaChanged)
                ) {
                  const prior = await meta.get({
                    trans,
                    key: "collection-generation",
                  });
                  state.generation ??= Number(prior?.generation ?? 0) + 1;
                  state.mediaChanged ||= Boolean(mediaTable);
                  const saved = await meta.mutate({
                    trans,
                    type: "put",
                    values: [
                      {
                        id: "collection-generation",
                        generation: state.generation,
                        mediaGeneration: state.mediaChanged
                          ? state.generation
                          : prior?.mediaGeneration,
                      },
                      ...(mediaTable
                        ? [{ id: "collection-media-cleanup" }]
                        : []),
                    ],
                  });
                  if (saved.numFailures) throw saved.failures[0];
                }
                if (mediaTable) {
                  const ids = keys.filter(
                    (key, i): key is string =>
                      typeof key === "string" && !result.failures[i],
                  );
                  const saved =
                    request.type === "put" || request.type === "add"
                      ? await media.mutate({
                          trans,
                          type: "put",
                          values: ids.map((id) => ({
                            key: mediaKey(mediaTable, id),
                            table: mediaTable,
                            id,
                            generation: state.generation,
                          })),
                        })
                      : await media.mutate({
                          trans,
                          type: "delete",
                          keys: [
                            ...removed,
                            ...ids.map((id) => mediaKey(mediaTable, id)),
                          ],
                        });
                  if (saved.numFailures) throw saved.failures[0];
                }
                return result;
              });
              state.tail = work.catch((error: unknown) => {
                (trans as IDBTransaction).abort();
                throw error;
              });
              return state.tail as typeof work;
            },
          };
        },
      };
    },
  });
}
