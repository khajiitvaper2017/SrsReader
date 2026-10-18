import { t } from "./i18n";
import { useEffect, useState } from "react";
import { rpc } from "./api";
import type { Example } from "./examples";
import type { LookupWord, Settings } from "./model";
import { Sentence } from "./ui";
import { SentenceTranslation } from "./SentenceTranslation";
import { browser } from "wxt/browser";

export function WordExamples({
  word,
  settings,
}: {
  word: LookupWord;
  settings: Settings;
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
    void rpc({ action: "examples", lemma: word.lemma })
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
  }, [word.lemma, word.language]);
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
        {t("download_example_sentences")}{" "}
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
        key={example.id}
        context={example.context}
        language={word.language}
        settings={settings}
      />
      <div className="example-footer" data-srs-reader="">
        <a
          href={example.context.url}
          target="_blank"
          rel="noopener noreferrer"
          title="CC BY 2.0 FR"
        >
          Tatoeba · {example.author}
        </a>
        {examples.length > 1 && (
          <button
            className="link"
            onClick={() => setIndex((index + 1) % examples.length)}
          >
            {t("another_example")}{" "}
          </button>
        )}
      </div>
    </div>
  );
}
