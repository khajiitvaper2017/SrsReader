import { t } from "@/shared/i18n/i18n";
import {
  readWeights,
  RwkvModel,
  type ModelSpec,
} from "@/srs/engines/rwkv/model";
import { BlobReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js";

const release =
  "https://github.com/JSchoreels/anki-rwkv/releases/download/small-model-sm40-2026-10-19/sm40v2-package.zip";

const archiveHash =
  "9bc1e3e4040ce9693f230e905abb5c925b1102f787424b9059543ae900f1e2a2";

export const weightHash =
  "6196c5fadd611827123102563639393fdcea99bfca83e3fb336fae1cd4bfc7c8";

export const specHash =
  "9bd41f1189dc0113277d371223ce805612aaec07101804160fe86312eed15de3";

export const cacheName = "srs-reader-rwkv-sm40v2";

export const assetUrl = (file: string) => `${release}/${file}`;

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
