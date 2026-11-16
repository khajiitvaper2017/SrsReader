import { db } from "@/platform/database/db";
import { t } from "@/shared/i18n/i18n";

const indexedTables = () => [
  db.entries,
  db.frequencies,
  db.ipa,
  db.tags,
  db.dictionaryMedia,
  db.phrases,
];
const revisionTables = () => [...indexedTables(), db.entryMatches, db.archives];

export async function removeRevision(id: string) {
  return db.transaction("rw", revisionTables(), async () => {
    let removed = 0;
    for (const table of indexedTables())
      removed += await table.where("revisionId").equals(id).delete();
    removed += await db.entryMatches.where(":id").startsWith(`${id}:`).delete();
    removed += await db.archives.where(":id").equals(id).delete();
    return removed;
  });
}

// Call while holding the dictionary-write lock. The transaction keeps the
// installed revisions stable and rolls back if cleanup is interrupted.
export async function cleanupUnusedRevisions() {
  return db.transaction(
    "rw",
    [...revisionTables(), db.dictionaries],
    async () => {
      const active = new Set(
        (await db.dictionaries.toArray()).map(
          (dictionary) => dictionary.revisionId,
        ),
      );
      const revisions = new Set(
        (
          await Promise.all(
            indexedTables().map((table) =>
              table.orderBy("revisionId").uniqueKeys(),
            ),
          )
        )
          .flat()
          .map(String),
      );
      for (const revision of await db.archives.toCollection().primaryKeys())
        revisions.add(revision);

      // Match rows are grouped by revision in their primary keys. Jump over each
      // prefix instead of reading millions of match records or adding an index.
      let last: string | undefined;
      for (;;) {
        const match = await (
          last === undefined
            ? db.entryMatches.toCollection()
            : db.entryMatches.where(":id").above(last)
        ).first();
        if (!match) break;
        revisions.add(match.revisionId);
        const upper = `${match.revisionId}:\uffff`;
        last =
          match.id.startsWith(`${match.revisionId}:`) && upper > match.id
            ? upper
            : match.id;
      }
      let removedRevisions = 0;
      let records = 0;
      for (const revision of revisions) {
        if (active.has(revision)) continue;
        records += await removeRevision(revision);
        removedRevisions++;
      }
      return { revisions: removedRevisions, records };
    },
  );
}

export function cleanupDictionaryData() {
  return navigator.locks.request(
    "srs-reader-dictionary-write",
    { ifAvailable: true },
    async (lock) => {
      if (!lock) throw new Error(t("cleanup_import_running"));
      return db.transaction(
        "rw",
        [...revisionTables(), db.dictionaries, db.importTasks],
        async () => {
          if ((await db.importTasks.get("current"))?.status === "running")
            throw new Error(t("cleanup_import_running"));
          return cleanupUnusedRevisions();
        },
      );
    },
  );
}
