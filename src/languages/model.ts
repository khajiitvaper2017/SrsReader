import { languageCode } from "@/languages/codes";
import { t } from "@/shared/i18n/i18n";
import { z } from "zod";

export const languageSchema = z.string().transform((value, ctx) => {
  try {
    return languageCode(value);
  } catch {
    ctx.addIssue({ code: "custom", message: t("enter_a_valid_language_code") });
    return z.NEVER;
  }
});
