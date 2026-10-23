import { languageName } from "@/languages/codes";
import { t } from "@/shared/i18n/i18n";

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
  stopAudio();
  const version = playbackVersion;
  const voices = await localVoices();
  if (version !== playbackVersion) return;
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
