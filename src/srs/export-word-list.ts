import { normalize } from "@/languages/text";
import { db } from "@/platform/database/db";
import { srsWrite } from "@/platform/locks";
import { getSettings } from "@/settings/store";
import { deckIdsInTree } from "@/srs/deck-tree";
import { queueEntries } from "@/srs/queue-entries";
import { dailyCounts } from "@/srs/workload";

export type WordListFilter = "difficult" | "failed" | "autoBuried";

export function exportWordList(
  language: string,
  deckId: string,
  filters: WordListFilter[],
  minimumDifficulty: number,
) {
  return srsWrite(async () => {
    const settings = await getSettings();
    const deckIds =
      deckId && deckId !== "mined"
        ? deckIdsInTree(
            await db.decks.where("language").equals(language).toArray(),
            deckId,
          )
        : undefined;
    const [cards, today] = await Promise.all([
      queueEntries(language, deckIds),
      filters.includes("failed") || filters.includes("autoBuried")
        ? dailyCounts({ ...settings, studyLanguage: language })
        : undefined,
    ]);
    const words = new Set<string>();
    for (const card of cards) {
      if (deckId === "mined" && card.deckId !== null) continue;
      if (
        filters.length &&
        !filters.some((filter) => {
          switch (filter) {
            case "difficult":
              return (card.card?.difficulty ?? 0) >= minimumDifficulty;
            case "failed":
              return today?.byCard.get(card.id)?.failed;
            case "autoBuried":
              return today?.buried.has(card.id);
          }
        })
      )
        continue;
      const lemma = normalize(card.lemma).replace(/\s+/gu, " ").trim();
      if (lemma) words.add(lemma);
    }
    return [...words].sort(new Intl.Collator(language).compare);
  });
}
