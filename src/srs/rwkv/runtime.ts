import {
  db,
  type RwkvCard,
  type RwkvEntity,
  type RwkvMeta,
} from "@/platform/database/db";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { buildFeatures, emptyFeatures } from "@/srs/rwkv/features";
import {
  entityKey,
  readWeights,
  RwkvModel,
  type EntityStates,
  type ModelSpec,
} from "@/srs/rwkv/model";
import { pack, unpack } from "@/srs/rwkv/precision";
import { studyDay } from "@/srs/study-day";
import { BlobReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js";

const release =
  "https://github.com/JSchoreels/anki-rwkv/releases/download/small-model-sm40-2026-10-19/sm40v2-package.zip";
const archiveHash =
  "9bc1e3e4040ce9693f230e905abb5c925b1102f787424b9059543ae900f1e2a2";
const weightHash =
  "6196c5fadd611827123102563639393fdcea99bfca83e3fb336fae1cd4bfc7c8";
const specHash =
  "9bd41f1189dc0113277d371223ce805612aaec07101804160fe86312eed15de3";
const cacheName = "srs-reader-rwkv-sm40v2";
const assetUrl = (file: string) => `${release}/${file}`;
let loaded: Promise<RwkvModel> | undefined;
const digest = async (data: ArrayBuffer) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");

export async function downloadModel() {
  const cache = await caches.open(cacheName);
  if (
    (await cache.match(assetUrl("weights.int8.bin"))) &&
    (await cache.match(assetUrl("architecture.json")))
  )
    return;
  const response = await fetch(release);
  if (!response.ok) throw new Error(t("rwkv_download_failed"));
  const data = await response.arrayBuffer();
  if ((await digest(data)) !== archiveHash)
    throw new Error(t("rwkv_invalid_package"));
  const zip = new ZipReader(new BlobReader(new Blob([data])), {
    useWebWorkers: false,
  });
  try {
    const entries = await zip.getEntries();
    const assets: [string, ArrayBuffer][] = [];
    for (const [file, expected] of [
      ["weights.int8.bin", weightHash],
      ["architecture.json", specHash],
    ]) {
      const entry = entries.find(
        (entry) => entry.filename === `sm40v2/${file}`,
      );
      if (!entry || entry.directory || !entry.getData)
        throw new Error(t("rwkv_invalid_package"));
      const bytes = await entry.getData(new Uint8ArrayWriter());
      const buffer = new Uint8Array(bytes).buffer;
      if ((await digest(buffer)) !== expected)
        throw new Error(t("rwkv_invalid_package"));
      assets.push([file!, buffer]);
    }
    for (const [file, buffer] of assets)
      await cache.put(assetUrl(file), new Response(buffer));
  } finally {
    await zip.close();
  }
}

export async function loadModel() {
  loaded ??= (async () => {
    const cache = await caches.open(cacheName);
    const [weights, architecture] = await Promise.all([
      cache.match(assetUrl("weights.int8.bin")),
      cache.match(assetUrl("architecture.json")),
    ]);
    if (!weights || !architecture)
      throw Object.assign(new Error(t("rwkv_not_ready")), {
        code: "RWKV_NOT_READY",
      });
    return new RwkvModel(
      readWeights(await weights.arrayBuffer()),
      (await architecture.json()) as ModelSpec,
    );
  })().catch((error) => {
    loaded = undefined;
    throw error;
  });
  return loaded;
}
const cacheKey = (settings: Settings) =>
  JSON.stringify([
    weightHash,
    specHash,
    "w8-s8-features-v1",
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    settings.rolloverHour,
  ]);
export async function invalidateRwkv() {
  await db.rwkvMeta.clear();
  await db.rwkvEntities.clear();
  await db.rwkvCards.clear();
}

export async function rwkvStatus(settings: Settings) {
  const meta = await db.rwkvMeta.get("main");
  const total = (await db.srsMeta.get("main"))?.sequence ?? 0;
  const cache = await caches.open(cacheName);
  const downloaded = !!(await cache.match(assetUrl("weights.int8.bin")));
  const processed = meta?.key === cacheKey(settings) ? meta.cursor : 0;
  return {
    downloaded,
    processed,
    total,
    ready:
      downloaded &&
      !!meta &&
      meta.key === cacheKey(settings) &&
      processed === total,
  };
}

export async function replayBatch(settings: Settings) {
  await downloadModel();
  const model = await loadModel();
  let meta = await db.rwkvMeta.get("main");
  if (!meta || meta.key !== cacheKey(settings)) {
    await db.transaction(
      "rw",
      [db.rwkvMeta, db.rwkvEntities, db.rwkvCards],
      async () => {
        await invalidateRwkv();
        meta = {
          id: "main",
          key: cacheKey(settings),
          cursor: 0,
          features: emptyFeatures(),
        };
        await db.rwkvMeta.put(meta);
      },
    );
  }
  const current = structuredClone(meta!);
  const target = (await db.srsMeta.get("main"))?.sequence ?? 0;
  const history = await db.reviews
    .where("sequence")
    .above(current.cursor)
    .limit(128)
    .toArray();
  const entities = new Map<string, RwkvEntity>();
  const cards = new Map<string, RwkvCard>();
  const started = performance.now();
  for (const review of history) {
    if (review.active) {
      const language = (JSON.parse(review.wordId) as string[])[0]!;
      const old =
        cards.get(review.wordId) ?? (await db.rwkvCards.get(review.wordId));
      const row = buildFeatures(
        {
          wordId: review.wordId,
          language,
          time: review.time,
          day:
            review.after?.last_review_day ??
            studyDay(review.time, settings.rolloverHour),
          rating: review.rating,
          durationMs: review.durationMs,
        },
        old?.features,
        current.features,
      );
      const keys = row.ids.map((id, stream) => entityKey(stream, id));
      const missing = keys.filter((key) => !entities.has(key));
      for (const entity of await db.rwkvEntities.bulkGet(missing))
        if (entity) entities.set(entity.id, entity);
      const states: EntityStates = new Map();
      for (const key of keys) {
        const entity = entities.get(key);
        if (entity) states.set(key, unpack(entity.state));
      }
      const result = model.step(row.features, row.ids, states);
      for (const [stream, id] of row.ids.entries()) {
        const key = entityKey(stream, id);
        entities.set(key, {
          id: key,
          state: pack(result.states.get(key)!, stream === 0 || stream === 2),
        });
      }
      cards.set(review.wordId, {
        id: review.wordId,
        features: row.card,
        curve: { w: result.heads.w, s: result.heads.s, d: result.heads.d },
      });
      current.features = row.global;
    }
    current.cursor = review.sequence;
    if (performance.now() - started >= 150) break;
  }
  if (
    !history.length ||
    (current.cursor === history.at(-1)!.sequence && history.length < 128)
  )
    current.cursor = target;
  await db.transaction(
    "rw",
    [db.rwkvMeta, db.rwkvEntities, db.rwkvCards],
    async () => {
      await db.rwkvEntities.bulkPut([...entities.values()]);
      await db.rwkvCards.bulkPut([...cards.values()]);
      await db.rwkvMeta.put(current);
    },
  );
  return rwkvStatus(settings);
}

export async function simulateAnswers(
  wordId: string,
  language: string,
  time: number,
  durationMs: number | null,
  settings: Settings,
) {
  if (!(await rwkvStatus(settings)).ready)
    throw Object.assign(new Error(t("rwkv_not_ready")), {
      code: "RWKV_NOT_READY",
    });
  const model = await loadModel();
  const meta = (await db.rwkvMeta.get("main"))!;
  const card = await db.rwkvCards.get(wordId);
  const ids = [wordId, language, wordId, "main", "main"];
  const keys = ids.map((id, stream) => entityKey(stream, id));
  const existing = (await db.rwkvEntities.bulkGet(keys)).filter(
    (entity): entity is RwkvEntity => !!entity,
  );
  if (
    (card && existing.length !== ids.length) ||
    (!card &&
      (await db.reviews
        .where("wordId")
        .equals(wordId)
        .filter((review) => review.active && review.sequence <= meta.cursor)
        .first()))
  ) {
    await invalidateRwkv();
    throw Object.assign(new Error(t("rwkv_not_ready")), {
      code: "RWKV_NOT_READY",
    });
  }
  const states: EntityStates = new Map(
    existing.map((entity) => [entity.id, unpack(entity.state)]),
  );
  const answers = [1, 2, 3, 4].map((rating) => {
    const row = buildFeatures(
      {
        wordId,
        language,
        time,
        day: studyDay(time, settings.rolloverHour),
        rating,
        durationMs,
      },
      card?.features,
      meta.features,
    );
    const result = model.step(row.features, ids, states);
    return {
      heads: result.heads,
      entities: ids.map((id, stream) => {
        const key = entityKey(stream, id);
        return {
          id: key,
          state: pack(result.states.get(key)!, stream === 0 || stream === 2),
        };
      }),
      card: {
        id: wordId,
        features: row.card,
        curve: { w: result.heads.w, s: result.heads.s, d: result.heads.d },
      } satisfies RwkvCard,
      meta: { ...meta, features: row.global } satisfies RwkvMeta,
    };
  });
  return { model, answers, before: { entities: existing, card, meta } };
}
