import { languageSchema } from "@/languages/model";
import type { ImportProgress } from "@/shared/download";
import { z } from "zod";
import { importOptionsSchema } from "@/anki/model";

export const importInputSchema = z
  .object({
    type: z.enum(["dictionary", "examples", "morphology", "anki"]),
    language: languageSchema,
    locale: z.string(),
    blob: z.instanceof(Blob).optional(),
    url: z
      .url()
      .refine((url) => /^https?:\/\//u.test(url))
      .optional(),
    title: z.string().optional(),
    expectedId: z.string().optional(),
    options: importOptionsSchema.optional(),
  })
  .refine((input) => input.type !== "dictionary" || input.blob || input.url)
  .refine((input) => input.type !== "anki" || (input.blob && input.options));

export type ImportInput = z.infer<typeof importInputSchema>;
export type ImportTask = Omit<ImportInput, "blob"> & {
  id: "current";
  runId: string;
  status: "running" | "complete" | "error";
  progress?: ImportProgress;
  notice?: string;
  error?: string;
};
