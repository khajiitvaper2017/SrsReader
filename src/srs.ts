import { t, setInterfaceLanguage } from "./i18n";
import { createEmptyCard, fsrs, type Card, type Grade } from "ts-fsrs";
import { db } from "./db";
import { orderNewWords } from "./frequency";
import {
  defaults,
  settingsSchema,
  type LookupWord,
  type ReadingContext,
  type Schedule,
  type Settings,
  type Vocabulary,
} from "./model";

export async function getSettings(): Promise<Settings> {
  const settings = settingsSchema.parse(
    (await db.settings.get("main"))?.value || defaults,
  );
  await setInterfaceLanguage(
    settings.interfaceLanguage,
    settings.nativeLanguage,
  );
  return settings;
}
const toCard = (card: Schedule): Card => ({
  ...card,
  due: new Date(card.due),
  last_review:
    card.last_review === null ? undefined : new Date(card.last_review),
});
const fromCard = (card: Card): Schedule => ({
  ...card,
  due: card.due.getTime(),
  last_review: card.last_review?.getTime() ?? null,
});
export function freshWord(word: LookupWord): Vocabulary {
  return {
    ...word,
    meanings: structuredClone(word.meanings),
    contexts: [],
    known: false,
    suspended: false,
    card: null,
    version: 0,
    created: Date.now(),
    updated: Date.now(),
  };
}
function addContext(word: Vocabulary, context?: ReadingContext) {
  if (!context) return;
  const existing = word.contexts.find(
    (c) => c.sentence === context.sentence && c.start === context.start,
  );
  if (!existing) word.contexts.push(context);
  else if (context.translation) existing.translation = context.translation;
}
export async function mine(word: LookupWord, context?: ReadingContext) {
  return db.transaction("rw", db.vocabulary, async () => {
    const saved = (await db.vocabulary.get(word.id)) || freshWord(word);
    addContext(saved, context);
    if (!saved.card && !saved.known) saved.card = fromCard(createEmptyCard());
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
    if (!value && !saved.card) saved.card = fromCard(createEmptyCard());
    saved.updated = Date.now();
    saved.version++;
    await db.vocabulary.put(saved);
    return saved;
  });
}
export async function grade(
  word: LookupWord,
  rating: Grade,
  source: "reading" | "review",
  expectedVersion: number,
  context?: ReadingContext,
) {
  const settings = await getSettings();
  return db.transaction("rw", [db.vocabulary, db.reviews], async () => {
    const before = await db.vocabulary.get(word.id);
    if ((before?.version ?? 0) !== expectedVersion)
      throw new Error(t("this_word_changed_in_another_tab_reopen_it"));
    if (before?.known)
      throw new Error(t("unmaster_this_word_before_reviewing_it"));
    if (before?.suspended)
      throw new Error(t("resume_this_word_before_grading_it"));
    const saved = structuredClone(before || freshWord(word));
    addContext(saved, context);
    const now = new Date();
    const result = fsrs({ request_retention: settings.retention }).next(
      saved.card ? toCard(saved.card) : createEmptyCard(now),
      now,
      rating,
    );
    saved.card = fromCard(result.card);
    saved.updated = now.getTime();
    saved.version++;
    await db.vocabulary.put(saved);
    const id = crypto.randomUUID();
    await db.reviews.put({
      id,
      wordId: word.id,
      time: now.getTime(),
      rating,
      source,
      before: before || null,
      afterVersion: saved.version,
      log: Object.fromEntries(
        Object.entries(result.log).map(([k, v]) => [
          k,
          v instanceof Date ? v.getTime() : (v ?? null),
        ]),
      ),
      scheduler: "ts-fsrs@5.4.2/FSRS-6",
      retention: settings.retention,
    });
    return { word: saved, reviewId: id };
  });
}
export async function undoReview(id: string) {
  await db.transaction("rw", [db.vocabulary, db.reviews], async () => {
    const review = await db.reviews.get(id);
    if (!review)
      throw new Error(t("this_review_is_no_longer_available_to_undo"));
    const current = await db.vocabulary.get(review.wordId);
    if (current?.version !== review.afterVersion)
      throw new Error(t("this_word_changed_after_that_review_and_cannot"));
    if (review.before)
      await db.vocabulary.put({
        ...review.before,
        version: current.version + 1,
      });
    else await db.vocabulary.delete(review.wordId);
    await db.reviews.delete(id);
  });
}
export async function preview(word?: Vocabulary) {
  const settings = await getSettings();
  const results = fsrs({ request_retention: settings.retention }).repeat(
    word?.card ? toCard(word.card) : createEmptyCard(),
    new Date(),
  );
  return [1, 2, 3, 4].map((rating) =>
    results[rating as Grade].card.due.getTime(),
  );
}
export async function reviewQueue() {
  const settings = await getSettings();
  const words = (
    await db.vocabulary
      .where("language")
      .equals(settings.studyLanguage)
      .toArray()
  ).filter((w) => w.card && !w.known && !w.suspended);
  const now = Date.now();
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const introduced = new Set(
    (await db.reviews.where("time").aboveOrEqual(midnight.getTime()).toArray())
      .filter(
        (r) =>
          JSON.parse(r.wordId)[0] === settings.studyLanguage &&
          (!r.before?.card || r.before.card.reps === 0),
      )
      .map((r) => r.wordId),
  );
  const due = words
    .filter((w) => w.card!.state !== 0 && w.card!.due <= now)
    .sort(
      (a, b) =>
        Number(a.card!.state === 2) - Number(b.card!.state === 2) ||
        a.card!.due - b.card!.due,
    );
  const fresh = (
    await orderNewWords(
      words.filter((w) => w.card!.state === 0),
      settings,
    )
  ).slice(0, Math.max(0, settings.newLimit - introduced.size));
  const waiting = words
    .filter((w) => w.card!.state === 1 || w.card!.state === 3)
    .map((w) => w.card!.due)
    .filter((d) => d > now)
    .sort((a, b) => a - b)[0];
  return {
    words: [...due, ...fresh],
    due: due.length,
    fresh: fresh.length,
    waiting: waiting ?? null,
  };
}
