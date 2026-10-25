import { languageSchema } from "@/languages/model";
import type { ImportProgress } from "@/shared/download";
import { z } from "zod";

export const importInputSchema = z
  .object({
    type: z.enum(["dictionary", "examples", "morphology"]),
    language: languageSchema,
    locale: z.string(),
    blob: z.instanceof(Blob).optional(),
    url: z
      .url()
      .refine((url) => /^https?:\/\//u.test(url))
      .optional(),
    title: z.string().optional(),
    expectedId: z.string().optional(),
  })
  .refine((input) => input.type !== "dictionary" || input.blob || input.url);

export type ImportInput = z.infer<typeof importInputSchema>;
export type ImportTask = ImportInput & {
  id: "current";
  runId: string;
  status: "running" | "complete" | "error";
  progress?: ImportProgress;
  notice?: string;
  error?: string;
};
