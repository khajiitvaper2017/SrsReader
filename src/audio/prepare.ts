import { audioClient } from "@/audio/client";
import type { AudioInfo } from "@/audio/model";
import { localVoices, prepareBlob } from "@/audio/playback";
import { getAudio } from "@/audio/storage";
import { normalize } from "@/languages/text";

export async function preparePronunciation(
  id: string,
  source?: AudioInfo,
  form?: string,
) {
  void localVoices();
  let record;
  try {
    await audioClient({ action: "audio", id, download: true, source, form });
    record = await getAudio(id);
  } catch (error) {
    if (source) throw error;
    record = await getAudio(id);
  }
  if (record && !source) {
    const [, lemma] = JSON.parse(id) as [string, string, string];
    if (record.lemma !== lemma && record.lemma !== (form && normalize(form)))
      record = undefined;
  }
  if (record) {
    // Playback reports decoding failures or falls back to the system voice.
    void prepareBlob(record.blob).catch(() => {});
  }
  return record;
}
