import { validateCardReferences } from "@/cards/validate";
import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
} from "@zip.js/zip.js";
import Dexie, { type Table } from "dexie";
import { exportDB, importInto, peakImportFile } from "dexie-export-import";
import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import { getSettings } from "@/settings/store";
import { saveBlob, type ImportProgress } from "@/shared/download";
import { t } from "@/shared/i18n/i18n";
import {
  fullManifestSchema,
  fullRowSchemas,
  isModelCache,
  type FullManifest,
} from "@/backups/full-model";

const transientTables = ["importTasks", "importFiles"];
const tables = () =>
  db.tables.filter((table) => !transientTables.includes(table.name));
const progress =
  (report: (value: ImportProgress) => void, phase: string) =>
  (value: { completedRows: number; totalRows?: number }) => {
    report({ phase, done: value.completedRows, total: value.totalRows || 0 });
    return true;
  };
async function idleImports() {
  if ((await db.importTasks.get("current"))?.status === "running")
    throw new Error(t("full_backup_import_running"));
}
async function cacheSnapshot() {
  const result: { cache: string; url: string; response: Response }[] = [];
  for (const name of (await caches.keys()).filter(isModelCache)) {
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (!response || response.status !== 200)
        throw new Error(t("full_backup_invalid"));
      result.push({ cache: name, url: request.url, response });
    }
  }
  return result;
}
async function replaceCaches(
  entries: Awaited<ReturnType<typeof cacheSnapshot>>,
) {
  for (const name of (await caches.keys()).filter(isModelCache))
    await caches.delete(name);
  for (const item of entries) {
    const cache = await caches.open(item.cache);
    await cache.put(item.url, item.response.clone());
  }
}

export async function exportFull(report: (value: ImportProgress) => void) {
  await db.open();
  const database = await srsWrite(() =>
    db.transaction("r", db.tables, async () => {
      await idleImports();
      return exportDB(db, {
        skipTables: transientTables,
        numRowsPerChunk: 500,
        noTransaction: true,
        progressCallback: progress(report, t("full_backup_exporting")),
      });
    }),
  );
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  try {
    report({ phase: t("full_backup_packing"), done: 0, total: 0 });
    await writer.add("database.json", new BlobReader(database));
    const manifest: FullManifest = {
      format: "srs-reader-full",
      version: 1,
      databaseVersion: db.verno,
      databaseBytes: database.size,
      created: new Date().toISOString(),
      caches: [],
    };
    const models = await cacheSnapshot();
    for (const [index, item] of models.entries()) {
      const path = `models/${index}`;
      manifest.caches.push({
        cache: item.cache,
        url: item.url,
        path,
        headers: [...item.response.headers],
      });
      await writer.add(path, new BlobReader(await item.response.blob()), {
        level: 0,
      });
      report({
        phase: t("full_backup_models"),
        done: index + 1,
        total: models.length,
      });
    }
    await writer.add("manifest.json", new TextReader(JSON.stringify(manifest)));
    saveBlob(
      await writer.close(),
      `srs-reader-full-${new Date().toISOString().slice(0, 10)}.zip`,
    );
  } catch (error) {
    await writer.close().catch(() => {});
    throw error;
  }
}

export async function readFull(
  file: File,
  report: (value: ImportProgress) => void,
) {
  await db.open();
  const name = `srs-reader-restore-${crypto.randomUUID()}`;
  let staged: Dexie | undefined;
  const close = async () => {
    staged?.close();
    await Dexie.delete(name);
  };
  const zip = new ZipReader(new BlobReader(file), { checkSignature: true });
  try {
    report({ phase: t("full_backup_validating"), done: 0, total: 0 });
    const files = (await zip.getEntries()).filter((entry) => !entry.directory);
    if (new Set(files.map((entry) => entry.filename)).size !== files.length)
      throw new Error(t("full_backup_invalid"));
    const manifestFile = files.find(
      (entry) => entry.filename === "manifest.json",
    );
    const databaseFile = files.find(
      (entry) => entry.filename === "database.json",
    );
    if (!manifestFile?.getData || !databaseFile?.getData)
      throw new Error(t("full_backup_invalid"));
    const manifest = fullManifestSchema.parse(
      JSON.parse(await manifestFile.getData(new TextWriter())),
    );
    if (manifest.databaseVersion !== db.verno)
      throw new Error(t("full_backup_version"));
    const database = await databaseFile.getData(
      new BlobWriter("application/json"),
    );
    // The streaming decoder can accept a missing closing document. Check the
    // exported size and JSON footer as well as its schema and decoded row counts.
    if (
      database.size !== manifest.databaseBytes ||
      !/\]\s*}\s*}\s*$/.test(await database.slice(-128).text())
    )
      throw new Error(t("full_backup_invalid"));
    const meta = await peakImportFile(database);
    const expected = tables();
    if (
      meta.formatName !== "dexie" ||
      meta.formatVersion !== 1 ||
      meta.data.databaseName !== db.name ||
      meta.data.databaseVersion !== db.verno ||
      meta.data.tables.length !== expected.length ||
      new Set(meta.data.tables.map((table) => table.name)).size !==
        expected.length ||
      expected.some((table) => {
        const item = meta.data.tables.find((item) => item.name === table.name);
        return (
          !item ||
          item.schema !==
            [table.schema.primKey, ...table.schema.indexes]
              .map((index) => index.src)
              .join(",") ||
          !Number.isSafeInteger(item.rowCount) ||
          item.rowCount < 0
        );
      })
    )
      throw new Error(t("full_backup_invalid"));
    const models: Awaited<ReturnType<typeof cacheSnapshot>> = [];
    const paths = new Set(["database.json", "manifest.json"]);
    const keys = new Set<string>();
    for (const item of manifest.caches) {
      const url = new URL(item.url);
      url.hash = "";
      const request = new Request(url.href);
      const key = JSON.stringify([item.cache, request.url]);
      if (paths.has(item.path) || keys.has(key))
        throw new Error(t("full_backup_invalid"));
      paths.add(item.path);
      keys.add(key);
      const entry = files.find((entry) => entry.filename === item.path);
      if (!entry?.getData) throw new Error(t("full_backup_invalid"));
      const body = await entry.getData(new BlobWriter());
      const response = new Response(body, { headers: item.headers });
      if (
        response.headers
          .get("vary")
          ?.split(",")
          .some((value) => value.trim() === "*")
      )
        throw new Error(t("full_backup_invalid"));
      models.push({ cache: item.cache, url: request.url, response });
    }
    if (files.some((entry) => !paths.has(entry.filename)))
      throw new Error(t("full_backup_invalid"));
    // Import into a temporary database first: validation, decoding, unique keys,
    // and row counts all succeed before the destination is touched.
    staged = new Dexie(name);
    staged
      .version(db.verno)
      .stores(
        Object.fromEntries(
          meta.data.tables.map((table) => [table.name, table.schema]),
        ),
      );
    await staged.open();
    await importInto(staged, database, {
      acceptNameDiff: true,
      filter: (table, row: unknown) => {
        const schema = fullRowSchemas[table];
        if (!schema) throw new Error(t("full_backup_invalid"));
        schema.parse(row);
        return true;
      },
      progressCallback: progress(report, t("full_backup_validating")),
    });
    for (const item of meta.data.tables)
      if ((await staged.table(item.name).count()) !== item.rowCount)
        throw new Error(t("full_backup_invalid"));
    validateCardReferences(
      await staged.table("noteTypes").toArray(),
      await staged.table("notes").toArray(),
      await staged.table("cards").toArray(),
      await staged.table("decks").toArray(),
      await staged.table("vocabulary").toArray(),
    );
    return {
      staged,
      models,
      close,
      rows: meta.data.tables.reduce((sum, item) => sum + item.rowCount, 0),
      words: meta.data.tables.find((item) => item.name === "vocabulary")!
        .rowCount,
      dictionaries: meta.data.tables.find(
        (item) => item.name === "dictionaries",
      )!.rowCount,
    };
  } catch (error) {
    await close();
    throw error;
  } finally {
    await zip.close();
  }
}

async function copyTable(
  source: Table,
  target: Table,
  report: (rows: number) => void,
) {
  let last: string | undefined;
  for (;;) {
    const rows = await Dexie.waitFor(
      (last === undefined
        ? source.toCollection()
        : source.where(":id").above(last)
      )
        .limit(500)
        .toArray(),
    );
    if (!rows.length) break;
    await target.bulkAdd(rows);
    last = rows[rows.length - 1][
      source.schema.primKey.keyPath as string
    ] as string;
    report(rows.length);
  }
}

export async function restoreFull(
  backup: Awaited<ReturnType<typeof readFull>>,
  report: (value: ImportProgress) => void,
) {
  return srsWrite(async () => {
    await idleImports();
    const previousModels = await cacheSnapshot();
    try {
      await replaceCaches(backup.models);
      await db.transaction("rw", db.tables, async () => {
        await idleImports();
        for (const table of db.tables) await table.clear();
        let done = 0;
        for (const table of tables())
          await copyTable(backup.staged.table(table.name), table, (rows) => {
            done += rows;
            report({
              phase: t("full_backup_restoring"),
              done,
              total: backup.rows,
            });
          });
      });
    } catch (error) {
      await replaceCaches(previousModels);
      throw error;
    }
    return getSettings();
  });
}
