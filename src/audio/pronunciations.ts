import type { AudioInfo } from "@/audio/model";
import type { AudioPreferences } from "@/audio/preferences";
import {
  audioSourceUrl,
  forvoSources,
  languagePodSources,
} from "@/audio/providers";
import { getAudio, saveAudio } from "@/audio/storage";
import { languageIso3 } from "@/languages/codes";
import { t } from "@/shared/i18n/i18n";
import { httpsUrl } from "@/shared/url";
import { wordId } from "@/vocabulary/model";

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

async function* commonsSources(
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

async function* pronunciationSources(
  language: string,
  lemma: string,
  reading: string,
  sources: AudioPreferences["audioSources"],
) {
  let found = false;
  let failure: unknown;
  const providers = {
    commons: commonsSources,
    languagePod101: languagePodSources,
    forvo: forvoSources,
  };
  for (const source of sources) {
    if (!source.enabled) continue;
    try {
      for await (const info of providers[source.type](
        language,
        lemma,
        reading,
      )) {
        found = true;
        yield info;
      }
    } catch (error) {
      failure = error;
    }
  }
  if (!found && failure) throw failure;
}

export async function findPronunciations(
  language: string,
  lemma: string,
  reading: string,
  providers: AudioPreferences["audioSources"],
) {
  const sources = new Map<string, AudioInfo>();
  for await (const source of pronunciationSources(
    language,
    lemma,
    reading,
    providers,
  ))
    sources.set(source.url, source);
  return [...sources.values()];
}

export async function cacheAudioSource(info: AudioInfo) {
  const url = audioSourceUrl(info.url);
  const saved = await getAudio(info.id);
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
  await saveAudio(record);
  return record;
}

export async function cachePronunciation(
  language: string,
  lemma: string,
  reading: string,
  providers: AudioPreferences["audioSources"],
) {
  const saved = await getAudio(wordId(language, lemma, reading));
  if (saved) return saved;
  for await (const source of pronunciationSources(
    language,
    lemma,
    reading,
    providers,
  )) {
    const record = await cacheAudioSource(source);
    if (record) return record;
  }
  return null;
}
