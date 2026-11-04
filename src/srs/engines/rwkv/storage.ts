import { db } from "@/platform/database/db";
import type {
  RwkvCard,
  RwkvEntity,
  RwkvMeta,
} from "@/srs/engines/rwkv/records";

export const loadMeta = () => db.rwkvMeta.get("main");
export const loadCard = (id: string) => db.rwkvCards.get(id);
export const loadEntities = (keys: string[]) => db.rwkvEntities.bulkGet(keys);
export const reviewSequence = () => db.reviews.count();
export const replayHistory = (cursor: number) =>
  db.reviews.orderBy("[time+sequence]").offset(cursor).limit(128).toArray();
export const replayedReview = (id: string) =>
  db.reviews
    .where("cardId")
    .equals(id)
    .filter((review) => review.active)
    .first();
export async function invalidateRwkv() {
  await db.rwkvMeta.clear();
  await db.rwkvEntities.clear();
  await db.rwkvCards.clear();
}
export function resetReplay(meta: RwkvMeta) {
  return db.transaction(
    "rw",
    [db.rwkvMeta, db.rwkvEntities, db.rwkvCards],
    async () => {
      await invalidateRwkv();
      await db.rwkvMeta.put(meta);
    },
  );
}
export function commitReplay(
  entities: Map<string, RwkvEntity>,
  cards: Map<string, RwkvCard>,
  current: RwkvMeta,
) {
  return db.transaction(
    "rw",
    [db.rwkvMeta, db.rwkvEntities, db.rwkvCards],
    async () => {
      await db.rwkvEntities.bulkPut([...entities.values()]);
      await db.rwkvCards.bulkPut([...cards.values()]);
      await db.rwkvMeta.put(current);
    },
  );
}
