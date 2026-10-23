import { DOMParser } from "linkedom";
import type { AudioInfo } from "@/audio/model";
import { t } from "@/shared/i18n/i18n";
import { httpsUrl } from "@/shared/url";
import { wordId } from "@/vocabulary/model";

const languagePodSites: Record<string, string> = {
  af: "afrikaanspod101",
  ar: "arabicpod101",
  bg: "bulgarianpod101",
  nl: "dutchpod101",
  tl: "filipinopod101",
  fi: "finnishpod101",
  fr: "frenchpod101",
  de: "germanpod101",
  el: "greekpod101",
  he: "hebrewpod101",
  hi: "hindipod101",
  hu: "hungarianpod101",
  id: "indonesianpod101",
  it: "italianpod101",
  ja: "japanesepod101",
  fa: "persianpod101",
  pl: "polishpod101",
  pt: "portuguesepod101",
  ro: "romanianpod101",
  ru: "russianpod101",
  es: "spanishpod101",
  sw: "swahilipod101",
  sv: "swedishpod101",
  th: "thaipod101",
  ur: "urdupod101",
  vi: "vietnamesepod101",
  yue: "cantoneseclass101",
  zh: "chineseclass101",
  cs: "czechclass101",
  da: "danishclass101",
  en: "englishclass101",
  ko: "koreanclass101",
  no: "norwegianclass101",
  nb: "norwegianclass101",
  nn: "norwegianclass101",
  tr: "turkishclass101",
};

export function audioSourceUrl(value: string) {
  const url = httpsUrl(value);
  const host = new URL(url).hostname;
  if (
    ![
      "upload.wikimedia.org",
      "audio.forvo.com",
      "cdn.innovativelanguage.com",
      "d1pra95f92lrn3.cloudfront.net",
    ].includes(host)
  )
    throw new Error(t("invalid_audio_source"));
  return url;
}

async function pronunciationPage(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    credentials: "omit",
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(
      t("pronunciation_lookup_failed_2", { status: response.status }),
    );
  return new DOMParser().parseFromString(await response.text(), "text/html");
}

export async function* forvoSources(
  language: string,
  lemma: string,
  reading: string,
) {
  const page = `https://forvo.com/word/${encodeURIComponent(lemma.toLowerCase().replaceAll(" ", "_"))}/`;
  const doc = await pronunciationPage(page);
  if (!doc) return;
  const section = doc.getElementById(`language-${language}`);
  if (!section) return;
  for (const button of section.querySelectorAll(".play[onclick]")) {
    const encoded = button
      .getAttribute("onclick")
      ?.match(/^Play\(\d+,\s*['"]([A-Za-z0-9+/=]+)['"]/i)?.[1];
    if (!encoded) continue;
    const path = atob(encoded);
    if (!/^\d+\/\d+\/[\w.-]+\.mp3$/.test(path)) continue;
    const creator =
      button
        .closest("li")
        ?.querySelector(".main_actions .title .active")
        ?.textContent?.trim() || "Forvo";
    yield {
      id: wordId(language, lemma, reading),
      language,
      lemma,
      url: audioSourceUrl(`https://audio.forvo.com/mp3/${path}`),
      page: `${page}#${language}`,
      creator,
      license: "",
      licenseUrl: "",
      name: `${lemma} — ${creator}`,
    } satisfies AudioInfo;
  }
}

export async function* languagePodSources(
  language: string,
  lemma: string,
  reading: string,
) {
  const site = languagePodSites[language];
  if (!site) return;
  const page = `https://www.${site}.com/learningcenter/reference/dictionary_post`;
  const doc = await pronunciationPage(page, {
    method: "POST",
    body: new URLSearchParams({
      post: "dictionary_reference",
      match_type: "exact",
      search_query: lemma,
      vulgar: "true",
    }),
  });
  if (!doc) return;
  const urls = new Set<string>();
  for (const row of doc.querySelectorAll(".dc-result-row")) {
    const term = row.querySelector(".dc-vocab")?.textContent?.trim();
    const kana = row.querySelector(".dc-vocab_kana")?.textContent?.trim();
    if (language === "ja") {
      if (!kana || (reading !== lemma && reading !== kana)) continue;
    } else if (term !== lemma) continue;
    const src = row.querySelector("audio source")?.getAttribute("src");
    if (!src) continue;
    const url = audioSourceUrl(new URL(src, page).href);
    if (urls.has(url)) continue;
    urls.add(url);
    yield {
      id: wordId(language, lemma, reading),
      language,
      lemma,
      url,
      page: `https://www.${site}.com/${site.replace(/(?:pod|class)101$/, "")}-dictionary/`,
      creator: "LanguagePod101",
      license: "",
      licenseUrl: "",
      name: term || lemma,
    } satisfies AudioInfo;
  }
}
