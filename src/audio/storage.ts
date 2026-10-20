import type { AudioRecord } from "@/audio/model";
import { db } from "@/platform/database/db";
export const getAudio = (id: string) => db.audio.get(id);
export const saveAudio = (record: AudioRecord) => db.audio.put(record);
