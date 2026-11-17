import { z } from "zod";
import { languageSchema } from "@/languages/model";

export const deckSchema = z.object({
  id: z.string(),
  language: languageSchema,
  name: z.string().trim().min(1),
  parentId: z.string().nullable().optional(),
  legacyPath: z.string().optional(),
  dictionaryId: z.string().optional(),
  limit: z.number().int().min(1).max(10000).optional(),
  sourceId: z.string().optional(),
  source: z.record(z.string(), z.unknown()).optional(),
  created: z.number().finite(),
});
export type Deck = z.infer<typeof deckSchema>;
