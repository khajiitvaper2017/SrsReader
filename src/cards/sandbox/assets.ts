import Dexie from "dexie";
import { assetId, type CardAsset } from "@/cards/model";
import { db } from "@/platform/database/db";
import { fieldText } from "@/cards/template";

const sharedAssets = new Map<string, Promise<string[]>>();

function references(text: string): string[] {
  return [
    ...text.matchAll(
      /\[sound:([^\]]+)\]|(?:src|href|poster)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)|["']([^"'\r\n]+\.(?:js|css|woff2?|ttf|otf|svg|png|jpe?g|avif|gif|ico))["']/gi,
    ),
  ].flatMap((match) =>
    match.slice(1).filter((value): value is string => !!value),
  );
}

export function cardAssetKey(namespace: string, html: string, css: string) {
  return JSON.stringify([
    namespace,
    [...new Set(references(`${html}\n${css}`))].sort(),
  ]);
}

export async function loadCardAssets(
  namespace: string,
  html: string,
  css: string,
): Promise<CardAsset[]> {
  let shared = sharedAssets.get(namespace);
  if (!shared) {
    // Index keys contain filenames only; a large package's audio/image blobs stay in storage.
    shared = db.cardAssets
      .where("[namespace+name]")
      .between([namespace, Dexie.minKey], [namespace, Dexie.maxKey])
      .keys()
      .then((keys) =>
        keys.flatMap((key) =>
          Array.isArray(key) &&
          typeof key[1] === "string" &&
          /\.(?:js|css|woff2?|ttf|otf)$/i.test(key[1])
            ? [key[1]]
            : [],
        ),
      );
    sharedAssets.set(namespace, shared);
  }
  const pending = [...(await shared), ...references(html), ...references(css)];
  const seen = new Set<string>();
  const loaded = new Set<string>();
  const assets: CardAsset[] = [];
  while (pending.length) {
    const name = pending.pop()!.replace(/^\.\//, "");
    if (/^(?:https?:|blob:|data:|#)/i.test(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    let asset = await db.cardAssets.get(assetId(namespace, name));
    if (!asset && fieldText(name) !== name)
      asset = await db.cardAssets.get(assetId(namespace, fieldText(name)));
    let decoded = name;
    if (!asset) {
      try {
        decoded = decodeURIComponent(name);
      } catch {
        /* Keep literal percent characters. */
      }
      if (decoded !== name)
        asset = await db.cardAssets.get(assetId(namespace, decoded));
    }
    if (!asset && /[?#]/.test(name))
      asset = await db.cardAssets.get(
        assetId(namespace, decoded.split(/[?#]/)[0]!),
      );
    if (!asset) continue;
    if (loaded.has(asset.id)) continue;
    loaded.add(asset.id);
    assets.push(asset);
    if (/\.(?:css|js)$/i.test(asset.name))
      pending.push(...references(await asset.blob.text()));
  }
  return assets;
}

export async function requestedCardAsset(namespace: string, name: string) {
  const clean = name.replace(/^\.\//, "");
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    /* Literal percent signs are valid. */
  }
  for (const candidate of new Set([
    name,
    clean,
    decoded,
    decoded.split(/[?#]/)[0]!,
  ])) {
    const asset = await db.cardAssets.get(assetId(namespace, candidate));
    if (asset) return asset.blob;
  }
}
