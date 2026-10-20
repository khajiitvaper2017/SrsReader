import type { LookupWord } from "@/dictionaries/model";
import { rpc } from "@/platform/messaging/send";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { SentenceTranslation } from "@/translation/SentenceTranslation";
import type { Example } from "@/vocabulary/examples/query";
import { Sentence } from "@/vocabulary/Sentence";
import { ChevronRight, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

export function WordExamples({
  word,
  settings,
  surface = word.lemma,
}: {
  word: Pick<LookupWord, "lemma" | "language">;
  settings: Settings;
  surface?: string;
}) {
  const [examples, setExamples] = useState<Example[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [installed, setInstalled] = useState(true);
  useEffect(() => {
    let alive = true;
    setExamples([]);
    setIndex(0);
    setError("");
    setInstalled(true);
    void rpc({ action: "examples", lemma: word.lemma, surface })
      .then((result) => {
        if (alive) {
          setExamples(result.examples);
          setInstalled(result.installed);
        }
      })
      .catch((error) => {
        if (alive) setError(error.message);
      });
    return () => {
      alive = false;
    };
  }, [word.lemma, word.language, surface]);
  const example = examples[index];
  if (error)
    return (
      <p className="translation-error" role="alert">
        {error}
      </p>
    );
  if (!example)
    return installed ? null : (
      <a
        className="example-download"
        data-srs-reader=""
        href={browser.runtime.getURL("/app.html") + "#settings"}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Download aria-hidden="true" /> {t("download_example_sentences")}
      </a>
    );
  return (
    <div
      className="word-examples"
      data-reading-source-url={example.context.url}
      data-reading-source-title={example.context.title}
    >
      <Sentence context={example.context} language={word.language} />
      <SentenceTranslation
        compact
        key={example.id}
        context={example.context}
        language={word.language}
        settings={settings}
      />
      {examples.length > 1 && (
        <button
          title={t("another_example")}
          aria-label={t("another_example")}
          className="quiet icon-button example-next"
          onClick={() => setIndex((index + 1) % examples.length)}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      )}
      <div className="example-footer" data-srs-reader="">
        <a
          href={example.context.url}
          target="_blank"
          rel="noopener noreferrer"
          title="CC BY 2.0 FR"
        >
          Tatoeba · {example.author}
        </a>
      </div>
    </div>
  );
}
