import sqlite3InitModule, { type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { t } from "@/shared/i18n/i18n";

let initialized: Promise<Sqlite3Static> | undefined;
export function sqlite() {
  if (initialized) return initialized;
  const scope = globalThis as typeof globalThis & {
    sqlite3ApiConfig?: { disable: { vfs: Record<string, boolean> } };
  };
  scope.sqlite3ApiConfig = {
    disable: {
      vfs: {
        kvvfs: true,
        opfs: true,
        "opfs-vfs": true,
        "opfs-wl": true,
        "opfs-sahpool": true,
      },
    },
  };
  const initialize = sqlite3InitModule as (options: {
    locateFile: () => string;
    print: () => void;
    printErr: () => void;
  }) => Promise<Sqlite3Static>;
  return (initialized = initialize({
    locateFile: () =>
      new URL("anki/sqlite3.wasm", new URL("/", import.meta.url)).href,
    print: () => {},
    printErr: () => {},
  }).catch((error: unknown) => {
    initialized = undefined;
    throw error;
  }));
}

export async function openCollection(bytes: Uint8Array) {
  if (new TextDecoder().decode(bytes.subarray(0, 16)) !== "SQLite format 3\0")
    throw new Error(t("anki_invalid_package"));
  const api = await sqlite();
  const database = new api.oo1.DB();
  const copy = new Uint8Array(bytes.byteLength + 20);
  copy.set(bytes);
  copy[18] = copy[19] = 1;
  try {
    // shortcut: import only scans tables; implement Anki case folding before name-index queries.
    database.checkRc(
      api.capi.sqlite3_create_collation_v2(
        database,
        "unicase",
        api.capi.SQLITE_UTF8,
        0,
        (_context, lengthA, pointerA, lengthB, pointerB) => {
          const heap = api.wasm.heap8u();
          for (let i = 0; i < Math.min(lengthA, lengthB); i++) {
            const difference = heap[pointerA + i]! - heap[pointerB + i]!;
            if (difference) return difference;
          }
          return lengthA - lengthB;
        },
        0,
      ),
    );
    const pointer = api.wasm.allocFromTypedArray(copy);
    database.checkRc(
      api.capi.sqlite3_deserialize(
        database,
        "main",
        pointer,
        bytes.byteLength,
        copy.byteLength,
        api.capi.SQLITE_DESERIALIZE_READONLY |
          api.capi.SQLITE_DESERIALIZE_FREEONCLOSE,
      ),
    );
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
