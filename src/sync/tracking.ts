import Dexie, {
  type DBCore,
  type DBCoreMutateRequest,
  type DBCoreTable,
  type DBCoreTransaction,
} from "dexie";
import { learningResetTables } from "@/backups/reset-scope";
import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import { browser } from "wxt/browser";
import { settingsSchema } from "@/settings/model";
import { portableSettings } from "@/sync/settings";
import { readMergeFrontier } from "@/sync/metadata";
import {
  recordKey,
  type SyncIdentity,
  type SyncKind,
  type SyncRecord,
  type SyncSnapshot,
} from "@/sync/model";

const trackedTables = [
  "vocabulary",
  "notes",
  "noteTypes",
  "reviews",
  "cards",
  "ankiReviews",
  "decks",
  "sentences",
  "settings",
  "cardAssets",
  "audio",
] as const;
const syncTables = [
  "syncRecords",
  "syncAuthored",
  "syncMeta",
  "syncDependencies",
];
const resources: Record<string, true> = {
  noteTypes: true,
  cardAssets: true,
  audio: true,
};
const cardFields = [
  "deckId",
  "suspended",
  "leech",
  "retentionOverride",
] as const;
const dependencyKinds: Record<string, true> = {
  vocabulary: true,
  notes: true,
  noteTypes: true,
  cards: true,
  decks: true,
  cardAssets: true,
  audio: true,
  sentences: true,
  ankiReviews: true,
};
const listeners = new Set<() => void>();
let channel: BroadcastChannel | undefined;
type Row = Record<string, unknown>;
type TransactionState = {
  suppressed: number;
  answer: number;
  restoring: number;
  undo: number;
  reviewId?: string;
  restoredReviews?: Map<string, Row>;
  rebasingRecords?: ReadonlyMap<string, SyncRecord>;
  changed: boolean;
  tail: Promise<unknown>;
};
const transactions = new WeakMap<DBCoreTransaction, TransactionState>();
const trackingCores = new WeakMap<Dexie, DBCore>();
const allRange = { type: 3 as const, lower: undefined, upper: undefined };

function notify() {
  for (const listener of listeners) listener();
}
function editChannel() {
  if (!channel && typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("srs-reader-sync-edits");
    channel.onmessage = notify;
  }
  return channel;
}
export function onSyncEdit(listener: () => void) {
  editChannel();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function stateFor(trans: DBCoreTransaction): TransactionState {
  let state = transactions.get(trans);
  if (!state) {
    state = {
      suppressed: 0,
      answer: 0,
      restoring: 0,
      undo: 0,
      changed: false,
      tail: Dexie.Promise.resolve(),
    };
    transactions.set(trans, state);
    (trans as IDBTransaction).addEventListener(
      "complete",
      () => {
        if (!state!.changed) return;
        notify();
        editChannel()?.postMessage(null);
        void browser?.runtime
          ?.sendMessage({ action: "syncEdited" })
          .catch(() => {});
      },
      { once: true },
    );
  }
  return state;
}

// Suppression belongs to the actual IndexedDB transaction, never to a global
// asynchronous flag: another tab or a concurrent transaction remains tracked.
export async function withoutSyncTracking<T>(
  work: () => Promise<T>,
): Promise<T> {
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

// Review.after owns answer scheduling; undo only changes review.active. Neither
// operation is an explicit reset/reschedule checkpoint.
export async function withReviewScheduling<T>(
  work: () => Promise<T>,
  options: { undo?: boolean; reviewId?: string } = {},
): Promise<T> {
  const trans = Dexie.currentTransaction?.idbtrans;
  if (!trans)
    throw new Error("Review scheduling requires a database transaction");
  const state = stateFor(trans);
  const previousReviewId = state.reviewId;
  state.reviewId = options.reviewId;
  state.answer++;
  if (options.undo) state.undo++;
  try {
    return await work();
  } finally {
    state.answer--;
    if (options.undo) state.undo--;
    state.reviewId = previousReviewId;
  }
}

/** Restore differences are new local edits, not historical remote revisions. */
export async function withRestoredTracking<T>(
  work: () => Promise<T>,
): Promise<T> {
  const trans = Dexie.currentTransaction?.idbtrans;
  if (!trans)
    throw new Error("Restore tracking requires a database transaction");
  const state = stateFor(trans);
  state.restoring++;
  try {
    return await work();
  } finally {
    state.restoring--;
  }
}

function portableRow(kind: SyncKind, row: Row): Row {
  const value = { ...row };
  if (kind === "cards") {
    for (const key of ["schedule", "version", "srsVersion", "updated"])
      delete value[key];
  } else if (kind === "notes" || kind === "vocabulary") {
    delete value.version;
    delete value.updated;
  } else if (kind === "reviews") {
    delete value.sequence;
    delete value.afterVersion;
    delete value.afterSrsVersion;
    if (value.before && typeof value.before === "object") {
      const before = { ...(value.before as Row) };
      delete before.version;
      delete before.srsVersion;
      value.before = before;
    }
  }
  return value;
}

// Compare structured data without materializing large audio/media byte arrays.
// Distinct Blobs are conservatively replacements rather than comparing only
// their size/type, which would miss equal-size audio/image edits.
function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (a instanceof Blob || b instanceof Blob) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a);
  const right = Object.keys(b);
  return (
    left.length === right.length &&
    left.every(
      (key) => Object.hasOwn(b, key) && equal((a as Row)[key], (b as Row)[key]),
    )
  );
}

function originalTime(row: Row | undefined) {
  for (const key of ["updated", "time", "created", "mined", "imported"])
    if (typeof row?.[key] === "number" && Number.isFinite(row[key]))
      return row[key] as number;
  return 0;
}
async function put(
  core: DBCore,
  table: string,
  trans: DBCoreTransaction,
  values: unknown[],
) {
  if (!values.length) return;
  const result = await core.table(table).mutate({ type: "put", trans, values });
  if (result.numFailures) throw Object.values(result.failures)[0];
}
async function identity(
  core: DBCore,
  trans: DBCoreTransaction,
): Promise<SyncIdentity> {
  return core.table("syncMeta").get({ trans, key: "identity" });
}
async function author(
  core: DBCore,
  trans: DBCoreTransaction,
  kind: SyncKind,
  id: string,
  value: Row | null,
  time: number,
  current: SyncIdentity,
  retainPrevious = true,
) {
  if (retainPrevious && value === null && dependencyKinds[kind]) {
    const previous = (await core
      .table("syncRecords")
      .get({ trans, key: recordKey(kind, id) })) as SyncRecord | undefined;
    if (previous && !previous.deleted && !previous.value?.field)
      await put(core, "syncDependencies", trans, [previous]);
  }
  const previous = stateFor(trans).rebasingRecords?.get(recordKey(kind, id));
  if (
    previous &&
    !previous.deleted &&
    (resources[kind] || equal(previous.value, value))
  )
    time = previous.time;
  const counter = ++current.counter;
  const record: SyncRecord = {
    key: recordKey(kind, id),
    kind,
    id,
    device: current.device,
    counter,
    observed: { ...current.observed },
    time,
    deleted: value === null,
    value,
  };
  current.observed[current.device] = counter;
  await put(core, "syncAuthored", trans, [record]);
  await put(core, "syncRecords", trans, [record]);
  stateFor(trans).changed = true;
}

export async function deleteLearningRecords() {
  await discardStagedAnkiMedia();
  const trans = Dexie.currentTransaction!.idbtrans;
  const current = (await db.syncMeta.get("identity")) as
    SyncIdentity | undefined;
  if (current) {
    const core = trackingCores.get(db)!;
    const keys = await db.syncRecords
      .where("kind")
      .anyOf([...learningResetTables, "schedules"])
      .primaryKeys();
    const now = Date.now();
    // Clearing the entire collection only needs tombstones. Copying the deleted
    // records to dependency storage can rewrite gigabytes of attached media.
    for (const key of keys) {
      const [kind, id] = JSON.parse(key) as [SyncKind, string];
      await author(core, trans, kind, id, null, now, current, false);
    }
    await put(core, "syncMeta", trans, [current]);
  }
  await withoutSyncTracking(async () => {
    for (const table of learningResetTables) await db[table].clear();
  });
}

export const stagedAnkiMediaId = "staged-anki-media";

/** Call under the SRS write lock, before replacing or publishing the collection. */
export async function discardStagedAnkiMedia() {
  const stage = await db.syncMeta.get(stagedAnkiMediaId);
  if (!stage || !("namespace" in stage) || typeof stage.namespace !== "string")
    return;
  const namespace = stage.namespace;
  await db.transaction(
    "rw",
    [db.cardAssets, db.syncAuthored, db.syncRecords, db.syncMeta],
    async () => {
      const ids = await db.cardAssets
        .where("namespace")
        .equals(namespace)
        .primaryKeys();
      const keys = ids.map((id) => recordKey("cardAssets", id));
      await withoutSyncTracking(() => db.cardAssets.bulkDelete(ids));
      await db.syncAuthored.bulkDelete(keys);
      await db.syncRecords.bulkDelete(keys);
      await db.syncMeta.delete(stagedAnkiMediaId);
    },
  );
}

async function recordChange(
  core: DBCore,
  trans: DBCoreTransaction,
  kind: SyncKind,
  old: Row | undefined,
  next: Row | undefined,
  current: SyncIdentity,
  baseline = false,
  baselineReview?: Row,
) {
  if (!old && !next) return;
  if (!baseline && kind === "cards" && stateFor(trans).undo) return;
  // Resource garbage collection is local-only. A peer may still reference it.
  if (!next && resources[kind]) return;
  const id = String((next ?? old)!.id);
  const time = baseline
    ? originalTime(next)
    : stateFor(trans).restoring
      ? Date.now()
      : next && originalTime(next) !== originalTime(old)
        ? originalTime(next)
        : Date.now();
  if (kind === "settings") {
    const before = old
      ? portableSettings(settingsSchema.parse(old.value))
      : baseline
        ? {}
        : portableSettings(settingsSchema.parse({}));
    const after = next
      ? portableSettings(settingsSchema.parse(next.value))
      : {};
    for (const field of new Set([
      ...Object.keys(before),
      ...Object.keys(after),
    ])) {
      if (
        equal(before[field], after[field]) &&
        Object.hasOwn(before, field) === Object.hasOwn(after, field)
      )
        continue;
      await author(
        core,
        trans,
        kind,
        JSON.stringify([id, field]),
        Object.hasOwn(after, field) ? { id, field, value: after[field] } : null,
        time,
        current,
      );
    }
    return;
  }
  const before = old && portableRow(kind, old);
  let after = next && portableRow(kind, next);
  if (kind === "reviews" && stateFor(trans).undo && next) {
    const winner = (await core
      .table("syncRecords")
      .get({ trans, key: recordKey(kind, id) })) as SyncRecord | undefined;
    if (winner?.value) after = { ...winner.value, active: next.active };
  }
  if (kind !== "cards" && !equal(before, after))
    await author(core, trans, kind, id, after ?? null, time, current);
  if (kind === "cards") {
    const restored = stateFor(trans).restoring > 0;
    const beforeAnswer =
      (baseline || restored) &&
      baselineReview &&
      next?.srsVersion === baselineReview.afterSrsVersion
        ? (baselineReview.before as Row | null)
        : undefined;
    const base = after;
    if (base && beforeAnswer)
      for (const field of ["suspended", "leech"])
        base[field] = beforeAnswer[field];
    const structural = (value: Row | undefined) =>
      value &&
      Object.fromEntries(
        Object.entries(value).filter(
          ([key]) => !(cardFields as readonly string[]).includes(key),
        ),
      );
    if (!equal(structural(before), structural(after)))
      await author(core, trans, kind, id, base ?? null, time, current);
    if (next)
      for (const field of cardFields) {
        const answerField =
          beforeAnswer &&
          (field === "suspended" || field === "leech") &&
          !equal(beforeAnswer[field], next[field]);
        if (
          old &&
          equal(old[field], next[field]) &&
          !(restored && answerField && !equal(old, next))
        )
          continue;
        const reviewId =
          baseline || restored
            ? answerField
              ? baselineReview?.id
              : undefined
            : stateFor(trans).reviewId;
        if (restored && reviewId && beforeAnswer)
          await author(
            core,
            trans,
            kind,
            JSON.stringify([id, field]),
            { id, field, value: beforeAnswer[field] },
            time,
            current,
          );
        const value: Row = { id, field, value: next[field] };
        if (reviewId) value.reviewId = reviewId;
        await author(
          core,
          trans,
          kind,
          JSON.stringify(reviewId ? [id, field, reviewId] : [id, field]),
          value,
          time,
          current,
        );
      }
    if (
      (baseline || !stateFor(trans).answer) &&
      ((!old && next) ||
        !next ||
        !equal(old?.schedule, next.schedule) ||
        (restored && !equal(old, next)))
    ) {
      const checkpoint: Row | null = next
        ? { id, schedule: next.schedule }
        : null;
      if (
        checkpoint &&
        baselineReview &&
        next &&
        next.srsVersion === baselineReview.afterSrsVersion &&
        equal(baselineReview.after, next.schedule)
      )
        checkpoint.reviewId = baselineReview.id;
      await author(core, trans, "schedules", id, checkpoint, time, current);
    }
  }
}

async function authorBaseline(
  core: DBCore,
  trans: DBCoreTransaction,
  current: SyncIdentity,
) {
  const present = new Set<string>();
  const reviews = core.table("reviews");
  const latestReviews = new Map<string, Row>();
  for (const review of (
    await reviews.query({
      trans,
      values: true,
      query: { index: reviews.schema.primaryKey, range: allRange },
    })
  ).result) {
    if (!review.active) continue;
    const previous = latestReviews.get(review.cardId);
    if (
      !previous ||
      review.time > Number(previous.time) ||
      (review.time === previous.time &&
        review.sequence > Number(previous.sequence))
    )
      latestReviews.set(review.cardId, review);
  }
  for (const name of trackedTables) {
    const table = core.table(name);
    const { result } = await table.query({
      trans,
      values: true,
      query: { index: table.schema.primaryKey, range: allRange },
    });
    for (const row of result) {
      present.add(recordKey(name, row.id));
      if (name === "cards") present.add(recordKey("schedules", row.id));
      await recordChange(
        core,
        trans,
        name,
        undefined,
        row,
        current,
        true,
        name === "cards" ? latestReviews.get(row.id) : undefined,
      );
    }
  }
  return present;
}

async function bootstrap(core: DBCore, trans: DBCoreTransaction) {
  let current = await identity(core, trans);
  if (current) return current;
  current = {
    id: "identity",
    device: crypto.randomUUID(),
    counter: 1,
    published: 0,
    observed: {},
  };
  current.observed[current.device] = current.counter;
  await authorBaseline(core, trans, current);
  await put(core, "syncMeta", trans, [current]);
  stateFor(trans).changed = true;
  return current;
}

async function mutateTracked(
  core: DBCore,
  table: DBCoreTable,
  kind: SyncKind,
  request: DBCoreMutateRequest,
) {
  const current = await bootstrap(core, request.trans);
  let old: Row[];
  let keys: unknown[];
  if (request.type === "deleteRange") {
    old = (
      await table.query({
        trans: request.trans,
        values: true,
        query: { index: table.schema.primaryKey, range: request.range },
      })
    ).result;
    keys = old.map((row) => row.id);
  } else {
    keys =
      request.keys ??
      ("values" in request
        ? request.values.map((row) => table.schema.primaryKey.extractKey!(row))
        : []);
    old = await table.getMany({ trans: request.trans, keys });
  }
  const result = await table.mutate(request);
  const next =
    request.type === "put" || request.type === "add"
      ? await table.getMany({
          trans: request.trans,
          keys: result.results ?? keys,
        })
      : [];
  const state = stateFor(request.trans);
  if (kind === "reviews") state.restoredReviews = undefined;
  if (kind === "cards" && state.restoring && !state.restoredReviews) {
    state.restoredReviews = new Map<string, Row>();
    const reviews = core.table("reviews");
    for (const review of (
      await reviews.query({
        trans: request.trans,
        values: true,
        query: { index: reviews.schema.primaryKey, range: allRange },
      })
    ).result) {
      if (!review.active) continue;
      const previous = state.restoredReviews.get(review.cardId);
      if (
        !previous ||
        review.time > Number(previous.time) ||
        (review.time === previous.time &&
          review.sequence > Number(previous.sequence))
      )
        state.restoredReviews.set(review.cardId, review);
    }
  }
  for (let index = 0; index < keys.length; index++) {
    if (result.failures[index]) continue;
    await recordChange(
      core,
      request.trans,
      kind,
      old[index],
      next[index],
      current,
      false,
      next[index]
        ? state.restoredReviews?.get(String(next[index].id))
        : undefined,
    );
  }
  await put(core, "syncMeta", request.trans, [current]);
  return result;
}

/** Installed before opening the database, including in app/content contexts. */
export function installSyncTracking(database: Dexie) {
  database.use({
    stack: "dbcore",
    name: "sync-tracking",
    level: -2,
    create(core) {
      // Older schema upgrades must not attempt to open stores that do not exist.
      const available = new Set(core.schema.tables.map((table) => table.name));
      if (!syncTables.every((name) => available.has(name))) return {};
      trackingCores.set(database, core);
      return {
        transaction(stores, mode, options) {
          const writesLearning =
            mode === "readwrite" &&
            stores.some((name) =>
              (trackedTables as readonly string[]).includes(name),
            );
          return core.transaction(
            writesLearning
              ? [...new Set([...stores, ...trackedTables, ...syncTables])]
              : stores,
            mode,
            options,
          );
        },
        table(name) {
          const table = core.table(name);
          if (!(trackedTables as readonly string[]).includes(name))
            return table;
          return {
            ...table,
            mutate(request) {
              if ((request.trans as IDBTransaction).mode === "versionchange")
                return table.mutate(request);
              const state = stateFor(request.trans);
              if (state.suppressed) return table.mutate(request);
              const pending = state.tail
                .then(() =>
                  mutateTracked(core, table, name as SyncKind, request),
                )
                .catch((error: unknown) => {
                  request.trans.abort();
                  throw error;
                });
              state.tail = pending;
              return pending;
            },
          };
        },
      };
    },
  });
}

export async function initializeTracking(): Promise<void> {
  await db.open();
  if (await db.syncMeta.get("identity")) return;
  await srsWrite(() =>
    db.transaction("rw", db.tables, async () => {
      const current = (await db.syncMeta.get("identity")) as
        SyncIdentity | undefined;
      if (current) return;
      await bootstrap(
        trackingCores.get(db)!,
        Dexie.currentTransaction!.idbtrans,
      );
    }),
  );
}
export async function pendingCount(): Promise<number> {
  await initializeTracking();
  return db.transaction("r", [db.syncMeta, db.syncAuthored], async () => {
    const current = (await db.syncMeta.get("identity")) as SyncIdentity;
    const count = await db.syncAuthored
      .where("counter")
      .above(current.published)
      .count();
    return count || (current.counter > current.published ? 1 : 0);
  });
}
export async function captureSnapshot(): Promise<SyncSnapshot> {
  await initializeTracking();
  return srsWrite(() =>
    db.transaction(
      "rw",
      [
        db.syncMeta,
        db.syncAuthored,
        db.syncRecords,
        db.syncDependencies,
        db.cardAssets,
      ],
      async () => {
        await discardStagedAnkiMedia();
        const current = (await db.syncMeta.get("identity")) as SyncIdentity;
        // The old cache may be unreadable. Advance past its revision without
        // reusing a publication name that can already be reserved on Drive.
        if (await db.syncMeta.where("id").equals("outgoing").count()) {
          await db.syncMeta.delete("outgoing");
          current.observed[current.device] = ++current.counter;
          await db.syncMeta.put(current);
        }
        const records = await db.syncAuthored.toArray();
        const authored = new Set(
          records.map((record) =>
            JSON.stringify([record.device, record.counter]),
          ),
        );
        const dependencies = new Map<string, SyncRecord>();
        const { retained } = await readMergeFrontier();
        for (const source of [
          await db.syncRecords.toArray(),
          await db.syncDependencies.toArray(),
          retained,
        ])
          for (const record of source) {
            if (
              record.deleted ||
              !dependencyKinds[record.kind] ||
              record.value?.field
            )
              continue;
            const dot = JSON.stringify([record.device, record.counter]);
            if (!authored.has(dot)) dependencies.set(dot, record);
          }
        const observed = { [current.device]: current.counter };
        for (const record of [...records, ...dependencies.values()]) {
          observed[record.device] = Math.max(
            observed[record.device] ?? 0,
            record.counter,
          );
          for (const [device, counter] of Object.entries(record.observed))
            observed[device] = Math.max(observed[device] ?? 0, counter);
        }
        return {
          format: "srs-reader-sync",
          version: 1,
          device: current.device,
          revision: current.counter,
          observed,
          records,
          dependencies: [...dependencies.values()],
        };
      },
    ),
  );
}
export async function markPublished(revision: number): Promise<void> {
  await db.transaction("rw", db.syncMeta, async () => {
    const current = (await db.syncMeta.get("identity")) as
      SyncIdentity | undefined;
    if (!current) return;
    await db.syncMeta.put({
      ...current,
      published: Math.max(
        current.published,
        Math.min(revision, current.counter),
      ),
    });
  });
}

/** A newly selected account receives the current state, not the old account's
 * unpublished subset. Keep the device identity and original content times. */
export async function prepareAccountSync(
  replaceAccount = false,
): Promise<void> {
  await initializeTracking();
  await srsWrite(() =>
    db.transaction("rw", db.tables, async () => {
      await discardStagedAnkiMedia();
      const current = (await db.syncMeta.get("identity")) as SyncIdentity;
      const records = await db.syncRecords.toArray();
      if (
        replaceAccount ||
        records.some((record) => record.device !== current.device)
      ) {
        const trans = Dexie.currentTransaction!.idbtrans;
        const state = stateFor(trans);
        state.rebasingRecords = new Map(
          records.map((record) => [record.key, record]),
        );
        await db.syncAuthored.clear();
        const before = current.counter;
        const core = trackingCores.get(db)!;
        const present = await authorBaseline(core, trans, current);
        for (const record of records) {
          if (
            !record.deleted ||
            record.kind === "settings" ||
            present.has(record.key)
          )
            continue;
          await author(
            core,
            trans,
            record.kind,
            record.id,
            null,
            record.time,
            current,
          );
        }
        if (current.counter === before)
          current.observed[current.device] = ++current.counter;
        state.rebasingRecords = undefined;
      }
      current.published = 0;
      await db.syncMeta.put(current);
    }),
  );
}
