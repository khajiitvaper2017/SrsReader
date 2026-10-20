import { db } from "@/platform/database/db";
export const installedMorphology = (language: string) =>
  db.morphology.get(language);
