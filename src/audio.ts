import { t } from "./i18n";
import { db } from "./db";
import { httpsUrl, wordId, type AudioInfo } from "./model";
import { languageName, languageIso3 } from "./languages";

function plain(text: string) {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}
async function commons(parameters: Record<string, string>) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    ...parameters,
  }).toString();
  const response = await fetch(url, {
    credentials: "omit",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok)
    throw new Error(
      t("pronunciation_lookup_failed_2", { status: response.status }),
    );
  const result = await response.json();
  if (result.error)
    throw new Error(result.error.info || t("pronunciation_lookup_failed"));
  return result.query;
}
async function* pronunciationSources(
  language: string,
  lemma: string,
  reading: string,
) {
  const id = wordId(language, lemma, reading);
  const iso3 = languageIso3(language);
  const escaped = lemma.replace(/[\\/.*+?^${}()|[\]]/g, "\\$&");
  const searches = [
    `intitle:/^${language}(-[a-zA-Z]{2})?-${escaped}[0-9]*\\.ogg$/i`,
    ...(iso3
      ? [
          `intitle:/-${escaped}\\.wav$/i incategory:"Lingua_Libre_pronunciation-${iso3}"`,
        ]
      : []),
  ];
  for (const search of searches) {
    const query = await commons({
      list: "search",
      srnamespace: "6",
      srlimit: "8",
      srsearch: search,
    });
    const titles: string[] = (query?.search || [])
      .map((r: { title: string }) => r.title)
      .filter(
        (title: string) =>
          new RegExp(
            `^File:${language}(-[a-zA-Z]{2})?-${escaped}[0-9]*\\.ogg$`,
            "iu",
          ).test(title) ||
          new RegExp(
            `^File:LL-Q\\d+\\s+\\(${iso3}\\)-.+-${escaped}\\.wav$`,
            "iu",
          ).test(title),
      );
    if (!titles.length) continue;
    const files = await commons({
      titles: titles.join("|"),
      prop: "imageinfo",
      iiprop: "url|user|extmetadata",
    });
    for (const page of Object.values(files?.pages || {}) as {
      title: string;
      imageinfo?: {
        url: string;
        descriptionurl: string;
        user: string;
        extmetadata?: Record<string, { value: string }>;
      }[];
    }[]) {
      const file = page.imageinfo?.[0];
      if (!file) continue;
      const url = httpsUrl(file.url);
      if (new URL(url).hostname !== "upload.wikimedia.org") continue;
      const meta = file.extmetadata || {};
      const license = plain(meta.LicenseShortName?.value || "");
      if (!license) continue;
      const info: AudioInfo = {
        id,
        language,
        lemma,
        url,
        page: file.descriptionurl,
        creator: plain(meta.Artist?.value || file.user),
        license,
        licenseUrl: meta.LicenseUrl?.value || "",
        name: page.title.replace(/^File:/, ""),
      };
      yield info;
    }
  }
}

export async function findPronunciations(
  language: string,
  lemma: string,
  reading: string,
) {
  const sources = new Map<string, AudioInfo>();
  for await (const source of pronunciationSources(language, lemma, reading))
    sources.set(source.url, source);
  return [...sources.values()];
}

export async function cacheAudioSource(info: AudioInfo) {
  const url = httpsUrl(info.url);
  if (new URL(url).hostname !== "upload.wikimedia.org")
    throw new Error(t("invalid_audio_source"));
  const saved = await db.audio.get(info.id);
  if (saved?.url === url) return saved;
  const response = await fetch(url, {
    credentials: "omit",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) return null;
  const blob = await response.blob();
  if (!blob.type.startsWith("audio/") && blob.type !== "application/ogg")
    return null;
  const record = { ...info, blob };
  await db.audio.put(record);
  return record;
}

export async function cachePronunciation(
  language: string,
  lemma: string,
  reading: string,
) {
  const saved = await db.audio.get(wordId(language, lemma, reading));
  if (saved) return saved;
  for await (const source of pronunciationSources(language, lemma, reading)) {
    const record = await cacheAudioSource(source);
    if (record) return record;
  }
  return null;
}

export async function localVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!("speechSynthesis" in globalThis)) return [];
  const voices = speechSynthesis.getVoices();
  if (voices.length) return voices.filter((v) => v.localService);
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      speechSynthesis.removeEventListener("voiceschanged", finish);
      resolve(speechSynthesis.getVoices().filter((v) => v.localService));
    };
    const timer = setTimeout(finish, 1000);
    speechSynthesis.addEventListener("voiceschanged", finish, { once: true });
  });
}
let audioContext: AudioContext | undefined;
let currentSource: AudioBufferSourceNode | undefined;
let currentGain: GainNode | undefined;
let playbackVersion = 0;
export function stopAudio() {
  playbackVersion++;
  if (currentSource) {
    currentSource.onended = null;
    currentSource.stop();
    currentSource.disconnect();
  }
  currentGain?.disconnect();
  currentSource = undefined;
  currentGain = undefined;
  if ("speechSynthesis" in globalThis) speechSynthesis.cancel();
}
export async function speak(text: string, language: string, voiceName: string) {
  const voices = await localVoices();
  const voice =
    voices.find(
      (v) => v.voiceURI === voiceName && v.lang.split("-")[0] === language,
    ) || voices.find((v) => v.lang.split("-")[0] === language);
  if (!voice)
    throw new Error(
      t("no_local_voice_is_installed_install_a_system", {
        value1: languageName(language),
      }),
    );
  stopAudio();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  return new Promise<void>((resolve, reject) => {
    utterance.onend = () => resolve();
    utterance.onerror = (event) =>
      event.error === "canceled" || event.error === "interrupted"
        ? resolve()
        : reject(new Error(t("the_system_voice_could_not_play_this_text")));
    speechSynthesis.speak(utterance);
  });
}
function normalizationGain(buffer: AudioBuffer): number {
  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, channel) => buffer.getChannelData(channel),
  );
  const frameSize = Math.max(1, Math.round(buffer.sampleRate * 0.02));
  const frames: { energy: number; samples: number }[] = [];
  let peak = 0;
  let maxEnergy = 0;
  for (let start = 0; start < buffer.length; start += frameSize) {
    const end = Math.min(start + frameSize, buffer.length);
    let energy = 0;
    for (const channel of channels) {
      for (let i = start; i < end; i++) {
        const sample = channel[i]!;
        energy += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
    }
    const samples = (end - start) * channels.length;
    frames.push({ energy, samples });
    maxEnergy = Math.max(maxEnergy, energy / samples);
  }
  // Ignore silent frames instead of boosting a recording because of long pauses.
  const gate = Math.max(0.000001, maxEnergy * 0.01);
  let energy = 0;
  let samples = 0;
  for (const frame of frames) {
    if (frame.energy / frame.samples < gate) continue;
    energy += frame.energy;
    samples += frame.samples;
  }
  if (!samples) return 1;
  // Match speech RMS, cap amplification at +12 dB, and keep peaks below half scale.
  return Math.min(0.0625 / Math.sqrt(energy / samples), 0.475 / peak, 4);
}

export async function playBlob(blob: Blob, normalize: boolean) {
  stopAudio();
  const version = playbackVersion;
  const context = (audioContext ??= new AudioContext());
  await context.resume();
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());
  if (version !== playbackVersion) return;
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  gain.gain.value = normalize ? normalizationGain(buffer) : 1;
  source.connect(gain);
  gain.connect(context.destination);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
    if (currentSource === source) {
      currentSource = undefined;
      currentGain = undefined;
    }
  };
  source.start();
  currentSource = source;
  currentGain = gain;
}
