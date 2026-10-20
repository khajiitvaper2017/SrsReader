import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { Empty } from "@/shared/ui/Empty";
import { ErrorBox } from "@/shared/ui/ErrorBox";
import { Select, SelectOption } from "@/shared/ui/Select";
import { WordDetails } from "@/vocabulary/components/WordDetails";
import { WordList } from "@/vocabulary/components/WordList";
import { useWords } from "@/vocabulary/hooks/useWords";
import { wordStateLabels, wordStates } from "@/vocabulary/state";

export function WordsPage({ settings }: { settings: Settings }) {
  const controller = useWords({ settings });
  const { query, setQuery, filter, setFilter, error, word, visible } =
    controller;

  return (
    <>
      <ErrorBox error={error} />
      <div className="word-toolbar">
        <input
          type="search"
          aria-label={t("search_saved_words")}
          placeholder={t("search_words")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select
          aria-label={t("filter_words")}
          value={filter}
          onValueChange={(value) => setFilter(value)}
        >
          <SelectOption value="all">{t("all_words")}</SelectOption>
          <SelectOption value="leeches">{t("srs_leeches")}</SelectOption>
          {wordStates
            .filter((state) => state !== "unknown")
            .map((state) => (
              <SelectOption key={state} value={state}>
                {t(wordStateLabels[state])}
              </SelectOption>
            ))}
        </Select>
      </div>
      {!visible.length ? (
        <section className="panel">
          <Empty title={t("no_words_found")}>
            <p>
              {query || filter !== "all"
                ? ""
                : t("save_a_word_from_a_website_to_add")}
            </p>
          </Empty>
        </section>
      ) : (
        <div className={`words-layout ${word ? "has-detail" : ""}`}>
          <WordList settings={settings} controller={controller} />
          {word && <WordDetails settings={settings} controller={controller} />}
        </div>
      )}
    </>
  );
}
