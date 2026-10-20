import { languageSchema } from "@/languages/model";
import { z } from "zod";

export const translationSchema = z.object({
  text: z.string().min(1).max(30000),
  language: languageSchema,
});
