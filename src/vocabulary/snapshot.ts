import type { LookupWord } from "@/dictionaries/model";
import { db } from "@/platform/database/db";

export async function snapshot(word: LookupWord) {
  const copy = structuredClone(word);
  const dictionaries = await db.dictionaries.toArray();
  async function embed(value: unknown, revisionId: string): Promise<void> {
    if (Array.isArray(value)) {
      for (const item of value) await embed(item, revisionId);
    } else if (value && typeof value === "object") {
      const node = value as Record<string, unknown>;
      if (
        (node.type === "image" || node.tag === "img") &&
        typeof node.path === "string"
      ) {
        const media = await db.dictionaryMedia.get(
          `${revisionId}:${node.path}`,
        );
        if (media) {
          const bytes = new Uint8Array(await media.blob.arrayBuffer());
          let binary = "";
          for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          const extension = node.path.split(".").pop()?.toLowerCase();
          const mime = (
            {
              png: "image/png",
              jpg: "image/jpeg",
              jpeg: "image/jpeg",
              gif: "image/gif",
              webp: "image/webp",
              svg: "image/svg+xml",
              avif: "image/avif",
            } as Record<string, string>
          )[extension || ""];
          if (mime) node.path = `data:${mime};base64,${btoa(binary)}`;
        }
      }
      for (const child of Object.values(node))
        if (typeof child === "object") await embed(child, revisionId);
    }
  }
  for (const meaning of copy.meanings) {
    delete meaning.customDefinitions;
    const dictionary = dictionaries.find((d) => d.id === meaning.dictionaryId);
    if (dictionary) await embed(meaning.definitions, dictionary.revisionId);
  }
  return copy;
}
