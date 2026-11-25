import { t } from "@/shared/i18n/i18n";
import { checkFSRS6Parameters } from "ts-fsrs/models/fsrs-6";
import { checkFSRS7Parameters } from "ts-fsrs/models/fsrs-7";
import { z } from "zod";

export const fsrsVersionSchema = z.enum(["7", "6"]);
const weightChecks = {
  "6": checkFSRS6Parameters,
  "7": checkFSRS7Parameters,
};
export const fsrsConfigSchema = z
  .object({
    version: fsrsVersionSchema,
    weights: z.array(z.number().finite()).min(1),
  })
  .superRefine((model, context) => {
    try {
      weightChecks[model.version](model.weights);
    } catch {
      context.addIssue({
        code: "custom",
        path: ["weights"],
        message: t("srs_fsrs_invalid_parameters"),
      });
    }
  });
export type FsrsConfig = z.infer<typeof fsrsConfigSchema>;
