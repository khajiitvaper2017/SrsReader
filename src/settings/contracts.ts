import { settingsSchema, type Settings } from "@/settings/model";
import { z } from "zod";

export const requests = [
  z.object({ action: z.literal("settings") }),
  z.object({ action: z.literal("setSettings"), value: settingsSchema }),
] as const;
export const requestSchema = z.discriminatedUnion("action", requests);
export type Request = z.infer<typeof requestSchema>;
export type Responses = { settings: Settings; setSettings: Settings };
