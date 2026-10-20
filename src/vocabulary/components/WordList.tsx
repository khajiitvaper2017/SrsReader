import { shortDefinition } from "@/dictionaries/definitions";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { useWords } from "@/vocabulary/hooks/useWords";
import { stateOf } from "@/vocabulary/model";
import { wordStateLabels } from "@/vocabulary/state";
export function WordList({
  settings,
  controller,
}: {
  settings: Settings;
  controller: ReturnType<typeof useWords>;
}) {
  const { selected, setSelected, setEditing, visible } = controller;
  return (
    <section className="word-list panel">
      {visible.map((w) => (
        <button
          className={`word-row ${selected === w.id ? "selected" : ""}`}
          key={w.id}
          onClick={() => {
            setSelected(w.id);
            setEditing(false);
          }}
        >
          <div>
            <strong lang={w.language}>{w.lemma}</strong>
            <span>
              {shortDefinition(w).slice(0, 140) || t("open_to_see_definitions")}
            </span>
          </div>
          <span
            className={`state state-${stateOf(w, settings.matureIntervalDays)}`}
          >
            {t(wordStateLabels[stateOf(w, settings.matureIntervalDays)])}
          </span>
        </button>
      ))}
    </section>
  );
}
