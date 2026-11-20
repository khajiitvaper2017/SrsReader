const blobHashes = new WeakMap<Blob, Promise<string>>();
export function mediaHash(blob: Blob) {
  let hash = blobHashes.get(blob);
  if (!hash) {
    hash = hashBytes(blob);
    blobHashes.set(blob, hash);
  }
  return hash;
}

async function hashBytes(blob: Blob) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
