import { db } from "./db";
import { httpsUrl, wordId, type AudioInfo } from "./model";
import { languageName, supportedLanguages } from "./languages";

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
    throw new Error(`Pronunciation lookup failed (${response.status}).`);
  const result = await response.json();
  if (result.error)
    throw new Error(result.error.info || "Pronunciation lookup failed.");
  return result.query;
}
export async function cachePronunciation(
  language: string,
  lemma: string,
  reading: string,
) {
  const id = wordId(language, lemma, reading);
  const saved = await db.audio.get(id);
  if (saved) return saved;
  const iso3 = supportedLanguages.find((item) => item.code === language)?.iso3;
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
      const response = await fetch(url, {
        credentials: "omit",
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) continue;
      const blob = await response.blob();
      if (!blob.type.startsWith("audio/") && blob.type !== "application/ogg")
        continue;
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
      const record = { ...info, blob };
      await db.audio.put(record);
      return record;
    }
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
let currentAudio: HTMLAudioElement | undefined;
let currentUrl: string | undefined;
export function stopAudio() {
  currentAudio?.pause();
  currentAudio = undefined;
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = undefined;
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
      `No local ${languageName(language)} voice is installed. Install a system voice or enable pronunciation downloads.`,
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
        : reject(new Error("The system voice could not play this text."));
    speechSynthesis.speak(utterance);
  });
}
export async function playBlob(blob: Blob) {
  stopAudio();
  currentUrl = URL.createObjectURL(blob);
  currentAudio = new Audio(currentUrl);
  currentAudio.onended = () => {
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = undefined;
  };
  await currentAudio.play();
}
