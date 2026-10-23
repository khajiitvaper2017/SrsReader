import { folded } from "@/languages/text";
import { t } from "@/shared/i18n/i18n";
import { languageSchema } from "@/languages/model";
import { z } from "zod";

export const immersionWeightSchema = z.number().min(0).max(1).multipleOf(0.01);
export const immersionWordSchema = z.object({
  id: z.string(),
  dictionaryId: z.string(),
  lemma: z.string().min(1),
  primaryHits: z.number().int().nonnegative(),
  secondaryHits: z.number().int().nonnegative(),
  score: z.number().nonnegative(),
});
export const immersionPassageSchema = z.object({
  id: z.string(),
  dictionaryId: z.string(),
});
export const immersionArchiveSchema = z
  .object({
    language: languageSchema,
    secondaryWeight: immersionWeightSchema,
    words: z.array(immersionWordSchema),
    passages: z.array(immersionPassageSchema),
  })
  .superRefine((archive, ctx) => {
    const dictionaryId = immersionId(archive.language);
    const words = new Set<string>();
    const passages = new Set<string>();
    const invalidWords = archive.words.some((word) => {
      const duplicate = words.has(word.id);
      words.add(word.id);
      return (
        duplicate ||
        word.dictionaryId !== dictionaryId ||
        word.id !==
          immersionWordId(dictionaryId, folded(word.lemma, archive.language))
      );
    });
    const invalidPassages = archive.passages.some((passage) => {
      let identity: unknown;
      try {
        identity = JSON.parse(passage.id);
      } catch {
        return true;
      }
      const duplicate = passages.has(passage.id);
      passages.add(passage.id);
      return (
        duplicate ||
        passage.dictionaryId !== dictionaryId ||
        !Array.isArray(identity) ||
        identity.length !== 2 ||
        identity[0] !== dictionaryId ||
        typeof identity[1] !== "string" ||
        !/^[0-9a-f]{64}$/.test(identity[1])
      );
    });
    if (invalidWords || invalidPassages)
      ctx.addIssue({ code: "custom", message: t("invalid_immersion_archive") });
  });
export type ImmersionWord = z.infer<typeof immersionWordSchema>;
export type ImmersionPassage = z.infer<typeof immersionPassageSchema>;
export const immersionId = (language: string) =>
  JSON.stringify(["immersion", language]);
export const immersionWordId = (dictionaryId: string, lemma: string) =>
  JSON.stringify([dictionaryId, lemma]);
export const immersionScore = (
  word: Pick<ImmersionWord, "primaryHits" | "secondaryHits">,
  weight: number,
) => Math.round((word.primaryHits + weight * word.secondaryHits) * 100) / 100;
