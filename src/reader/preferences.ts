import { inputPreventionSchema, lookupBindingSchema } from "@/reader/controls";
import { wordStylesSchema } from "@/settings/word-styles";
import { z } from "zod";

export const readerPreferencesSchema = z.object({
  lookupBindings: z.array(lookupBindingSchema).default([]),
  preventMiddleMouse: inputPreventionSchema,
  preventBackForward: inputPreventionSchema,
  paused: z.boolean().default(false),
  enabledHosts: z.array(z.string()).default([]),
  disabledHosts: z.array(z.string()).default([]),
  theme: z.enum(["system", "light", "dark", "oled"]).default("system"),
  accentColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#D26400"),
  popupPlacement: z.enum(["auto", "below", "beside"]).default("auto"),
  hideDictionarySources: z.boolean().default(true),
  ignoredTags: z.array(z.string()).default([]),
  nechybujte: z.boolean().default(false),
  scanPopups: z.boolean().default(true),
  udpipe: z.boolean().default(false),
  udpipeModels: z.record(z.string(), z.string()).default({}),
  ignoreProperNames: z.boolean().default(false),
  wordColorsEnabled: z.boolean().default(true),
  wordStyles: wordStylesSchema,
  matureIntervalDays: z.number().int().min(1).default(28),
});
export type ReaderPreferences = z.infer<typeof readerPreferencesSchema>;

export function isWebsiteEnabled(settings: ReaderPreferences, host: string) {
  return (
    !settings.disabledHosts.includes(host) &&
    (!settings.paused || settings.enabledHosts.includes(host))
  );
}
