import type { DBCoreTransaction, Dexie } from "dexie";

export const mediaLinkPrefix = "sync-merge-media:";
export type MediaLink = { syncMedia: string };

export function isMediaLink(value: unknown): value is MediaLink {
  return (
    !!value &&
    typeof value === "object" &&
    "syncMedia" in value &&
    typeof value.syncMedia === "string" &&
    value.syncMedia.startsWith(mediaLinkPrefix)
  );
}

export const mediaLinkFor = new WeakMap<Blob, MediaLink>();

export function resolveMediaLink(link: MediaLink, row: unknown): Blob {
  if (
    !row ||
    typeof row !== "object" ||
    !("blob" in row) ||
    !(row.blob instanceof Blob)
  )
    throw new Error("sync_invalid_media");
  mediaLinkFor.set(row.blob, link);
  return row.blob;
}

// Keep existing media readers and backup exports working with ordinary Blobs.
export function installMediaLinks(db: Dexie) {
  const tables = new Set(["cardAssets", "audio", "syncRecords"]);
  db.use({
    stack: "dbcore",
    name: "sync-media-links",
    level: -3,
    create(core) {
      if (!core.schema.tables.some(({ name }) => name === "syncMeta"))
        return {};
      const media = core.table("syncMeta");
      return {
        transaction(stores, mode, options) {
          return core.transaction(
            stores.some((name) => tables.has(name)) &&
              !stores.includes("syncMeta")
              ? [...stores, "syncMeta"]
              : stores,
            mode,
            options,
          );
        },
        table(name) {
          const table = core.table(name);
          if (!tables.has(name)) return table;
          const payload = name === "syncRecords";
          function hydrate(
            row: { blob?: unknown; value?: { blob?: unknown } } | undefined,
            trans: DBCoreTransaction,
          ) {
            const value = payload ? row?.value : row;
            const link = value?.blob;
            if (!isMediaLink(link)) return;
            return media.get({ trans, key: link.syncMedia }).then((backing) => {
              const hydrated = {
                ...value,
                blob: resolveMediaLink(link, backing),
              };
              return payload ? { ...row, value: hydrated } : hydrated;
            });
          }
          return {
            ...table,
            get: (request) =>
              table
                .get(request)
                .then((row) => hydrate(row, request.trans) ?? row),
            getMany: (request) =>
              table
                .getMany(request)
                .then((rows) =>
                  Promise.all(
                    rows.map((row) => hydrate(row, request.trans) ?? row),
                  ),
                ),
            query: (request) =>
              table.query(request).then(async (response) => {
                if (!request.values) return response;
                return {
                  result: await Promise.all(
                    response.result.map(
                      (row) => hydrate(row, request.trans) ?? row,
                    ),
                  ),
                };
              }),
            openCursor: async (request) => {
              const cursor = await table.openCursor(request);
              if (!cursor || !request.values) return cursor;
              const start = cursor.start.bind(cursor);
              let value: unknown;
              const wrapped = {
                ...cursor,
                get key() {
                  return cursor.key;
                },
                get primaryKey() {
                  return cursor.primaryKey;
                },
                get done() {
                  return cursor.done;
                },
                get value() {
                  return value;
                },
                continue: (key?: unknown) => cursor.continue(key),
                continuePrimaryKey: (key: unknown, pk: unknown) =>
                  cursor.continuePrimaryKey(key, pk),
                advance: (count: number) => cursor.advance(count),
                stop: (result?: unknown) => cursor.stop(result),
                fail: (error: Error) => cursor.fail(error),
                start: (next: () => void) =>
                  start(() => {
                    const row = cursor.value;
                    const pending = hydrate(row, request.trans);
                    if (pending) {
                      void pending
                        .then((row) => {
                          value = row;
                          next();
                        })
                        .catch(cursor.fail);
                    } else {
                      value = row;
                      next();
                    }
                  }),
                next: () => {
                  let advance = true;
                  return wrapped
                    .start(() => {
                      if (advance) cursor.continue();
                      else cursor.stop();
                      advance = false;
                    })
                    .then(() => wrapped);
                },
              };
              return wrapped;
            },
          };
        },
      };
    },
  });
}
