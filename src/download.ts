import type { ImportProgress } from "./dictionaries";

export async function readDownload(
  response: Response,
  phase: string,
  progress: (value: ImportProgress) => void,
) {
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body!.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let done = 0;
  let lastUpdate = 0;
  const report = () => progress({ phase, done, total, unit: "bytes" });
  report();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(chunk.value);
      done += chunk.value.byteLength;
      const now = performance.now();
      if (now - lastUpdate >= 100) {
        report();
        lastUpdate = now;
      }
    }
    report();
    return new Blob(chunks, {
      type: response.headers.get("content-type") || "",
    });
  } finally {
    reader.releaseLock();
  }
}
