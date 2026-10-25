import { audioClient } from "@/audio/client";
import type { AudioInfo } from "@/audio/model";
import { localVoices, prepareBlob } from "@/audio/playback";
import { getAudio } from "@/audio/storage";

export async function preparePronunciation(id: string, source?: AudioInfo) {
  void localVoices();
  let record = source ? undefined : await getAudio(id);
  if (!record) {
    try {
      await audioClient({ action: "audio", id, download: true, source });
      record = await getAudio(id);
    } catch (error) {
      if (source) throw error;
      /* The system voice remains available when the recording service is offline. */
    }
  }
  if (record) {
    // Playback reports decoding failures or falls back to the system voice.
    void prepareBlob(record.blob).catch(() => {});
  }
  return record;
}
