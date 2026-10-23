import { z } from "zod";
import { languageSchema } from "@/languages/model";

export const deckSchema = z.object({
  id: z.string(),
  language: languageSchema,
  name: z.string().trim().min(1),
  dictionaryId: z.string(),
  limit: z.number().int().min(1).max(10000),
  wordIds: z.array(z.string()),
  created: z.number().finite(),
});
export type Deck = z.infer<typeof deckSchema>;
