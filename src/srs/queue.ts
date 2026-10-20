import { orderNewWords } from "@/dictionaries/frequency";
import { getSettings } from "@/settings/store";
import { buildQueue } from "@/srs/queue-policy";
import { dailyCounts } from "@/srs/workload";
import { languageWords } from "@/vocabulary/storage";

export async function reviewQueue() {
  const settings = await getSettings(),
    now = Date.now();
  const words = (await languageWords(settings.studyLanguage)).filter(
    (word) => word.card && !word.known && !word.suspended,
  );
  const counts = await dailyCounts(settings, now);
  const orderedNew =
    (settings.reviewLimit ?? Infinity) > counts.reviews
      ? await orderNewWords(
          words.filter((word) => word.card!.state === 0),
          settings,
        )
      : [];
  return buildQueue(words, counts, settings, now, orderedNew);
}
