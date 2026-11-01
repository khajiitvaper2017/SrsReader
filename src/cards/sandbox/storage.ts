import type { CardStorageState } from "@/cards/sandbox/protocol";

const limit = 1024 * 1024;
const storageKey = (namespace: string) => `srs-card:${namespace}`;

function readRecord(
  storage: Storage,
  namespace: string,
): Record<string, string> {
  const text = storage.getItem(storageKey(namespace));
  if (
    !text ||
    text.length > limit ||
    new TextEncoder().encode(text).length > limit
  )
    return {};
  const record: unknown = JSON.parse(text);
  if (!record || typeof record !== "object" || Array.isArray(record)) return {};
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function readCardStorage(namespace: string): CardStorageState {
  return {
    local: readRecord(window.localStorage, namespace),
    session: readRecord(window.sessionStorage, namespace),
  };
}

export function writeCardStorage(namespace: string, message: unknown) {
  if (!message || typeof message !== "object") return;
  const change = message as Record<string, unknown>;
  if (change.kind !== "local" && change.kind !== "session") return;
  if (
    typeof change.operation !== "string" ||
    !["set", "remove", "clear"].includes(change.operation)
  )
    return;
  if (
    change.operation !== "clear" &&
    (typeof change.key !== "string" || change.key.length > limit)
  )
    return;
  if (
    change.operation === "set" &&
    (typeof change.value !== "string" || change.value.length > limit)
  )
    return;
  const storage =
    change.kind === "local" ? window.localStorage : window.sessionStorage;
  const entries =
    change.operation === "clear"
      ? []
      : Object.entries(readRecord(storage, namespace)).filter(
          ([key]) => key !== change.key,
        );
  if (change.operation === "set")
    entries.push([change.key as string, change.value as string]);
  const record = JSON.stringify(Object.fromEntries(entries));
  if (new TextEncoder().encode(record).length > limit)
    throw new DOMException("", "QuotaExceededError");
  storage.setItem(storageKey(namespace), record);
}
