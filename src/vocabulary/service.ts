import type { LookupWord } from "@/dictionaries/model";
import { db } from "@/shared/db";
import { emptySchedule } from "@/srs/scheduling";
import type { ReadingContext, Vocabulary } from "@/vocabulary/model";

export function freshWord(word: LookupWord): Vocabulary {
  return {
    ...word,
    meanings: structuredClone(word.meanings),
    contexts: [],
    known: false,
    suspended: false,
    card: null,
    srsVersion: 0,
    leech: false,
    retentionOverride: null,
    version: 0,
    created: Date.now(),
    updated: Date.now(),
  };
}

export function addContext(word: Vocabulary, context?: ReadingContext) {
  if (!context) return;
  const existing = word.contexts.find(
    (c) => c.sentence === context.sentence && c.start === context.start,
  );
  if (!existing) word.contexts.push(context);
  else if (context.translation && !existing.translation)
    existing.translation = context.translation;
}

export async function mine(word: LookupWord, context?: ReadingContext) {
  return db.transaction("rw", db.vocabulary, async () => {
    const saved = (await db.vocabulary.get(word.id)) || freshWord(word);
    addContext(saved, context);
    if (!saved.card && !saved.known) {
      saved.card = emptySchedule();
      saved.srsVersion++;
    }
    saved.updated = Date.now();
    saved.version++;
    await db.vocabulary.put(saved);
    return saved;
  });
}

export async function setMastered(word: LookupWord, value: boolean) {
  return db.transaction("rw", db.vocabulary, async () => {
    const saved = (await db.vocabulary.get(word.id)) || freshWord(word);
    saved.known = value;
    saved.suspended = false;
    if (!value && !saved.card) saved.card = emptySchedule();
    saved.updated = Date.now();
    saved.version++;
    saved.srsVersion++;
    await db.vocabulary.put(saved);
    return saved;
  });
}
