import { audioClient } from "@/audio/client";
import type { AudioInfo } from "@/audio/model";
import { localVoices, prepareBlob } from "@/audio/playback";
import { getAudio } from "@/audio/storage";

export async function preparePronunciation(id: string, source?: AudioInfo) {
  void localVoices();
  let record;
  try {
    await audioClient({ action: "audio", id, download: true, source });
    record = await getAudio(id);
  } catch (error) {
    if (source) throw error;
    record = await getAudio(id);
  }
  if (record) {
    // Playback reports decoding failures or falls back to the system voice.
    void prepareBlob(record.blob).catch(() => {});
  }
  return record;
}
