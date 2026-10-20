import { isRankSource } from "@/dictionaries/frequency";
import type { Dictionary } from "@/dictionaries/model";
import { learningStepsSchema, type Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { Select, SelectOption } from "@/shared/ui/Select";
import { srsClient } from "@/srs/client";
import { useSrsSettings } from "@/srs/hooks/useSrsSettings";

function NumberSetting({
  label,
  value,
  min = 0,
  max,
  onChange,
  help,
}: {
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  help?: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="setting-row">
      <span>
        <strong>{label}</strong>
        {help && <small>{help}</small>}
      </span>
      <input
        key={String(value)}
        type="number"
        min={min}
        max={max}
        step={1}
        defaultValue={value ?? ""}
        placeholder={t("srs_unlimited")}
        onBlur={(event) => {
          if (event.target.validity.valid)
            onChange(
              event.target.value === "" ? null : Number(event.target.value),
            );
          else event.target.reportValidity();
        }}
      />
    </label>
  );
}

export function SrsSettings({
  settings,
  dictionaries,
  onChange,
  onError,
}: {
  settings: Settings;
  dictionaries: Dictionary[];
  onChange: (patch: Partial<Settings>) => Promise<void>;
  onError: (message: string) => void;
}) {
  const { busy, message, setMessage, status, bands, setBands, task, prepare } =
    useSrsSettings({ settings, dictionaries, onChange, onError });

  const number = (
    label: string,
    key:
      | "minimumInterval"
      | "rolloverHour"
      | "learnAheadMinutes"
      | "reviewLimit"
      | "leechThreshold",
    min: number,
    max?: number,
    help?: string,
  ) => (
    <NumberSetting
      label={t(label)}
      value={settings[key]}
      min={min}
      max={max}
      help={help && t(help)}
      onChange={(value) => {
        if (value !== null || key === "reviewLimit")
          void onChange({ [key]: value });
      }}
    />
  );
  return (
    <div className="srs-settings">
      <label className="setting-row">
        <strong>{t("srs_algorithm")}</strong>
        <Select
          value={settings.algorithm}
          disabled={busy}
          onValueChange={(algorithm) =>
            void task(async () => {
              if (algorithm === "rwkv") await prepare();
              await onChange(
                await srsClient({
                  action: "activateAlgorithm",
                  algorithm: algorithm as Settings["algorithm"],
                }),
              );
              setMessage(t("srs_algorithm_ready"));
            })
          }
        >
          <SelectOption value="fsrs">FSRS</SelectOption>
          <SelectOption value="rwkv">RWKV w64</SelectOption>
        </Select>
      </label>
      <p className="setting-footnote">{t("rwkv_download_help")}</p>
      {settings.algorithm === "rwkv" && status && (
        <p className="muted">
          {status.ready
            ? t("rwkv_ready")
            : t("rwkv_replaying", {
                processed: status.processed,
                total: status.total,
              })}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {busy && (
        <progress
          aria-label={t("rwkv_preparing")}
          max={status?.total || undefined}
          value={status?.total ? status.processed : undefined}
        />
      )}
      <details>
        <summary>{t("srs_learning")}</summary>
        {(["learningSteps", "relearningSteps"] as const).map((key) => (
          <label className="setting-row" key={key}>
            <span>
              <strong>
                {t(
                  key === "learningSteps"
                    ? "srs_learning_steps"
                    : "srs_relearning_steps",
                )}
              </strong>
              <small>{t("srs_steps_help")}</small>
            </span>
            <input
              key={settings[key].join(" ")}
              type="text"
              defaultValue={settings[key].join(" ")}
              onBlur={(event) => {
                const steps = event.target.value.trim()
                  ? event.target.value.trim().split(/\s+/)
                  : [];
                if (learningStepsSchema.safeParse(steps).success)
                  void onChange({ [key]: steps });
                else onError(t("srs_invalid_steps"));
              }}
            />
          </label>
        ))}
        {number("srs_minimum_interval", "minimumInterval", 1, 36500)}
        {number("srs_rollover", "rolloverHour", 0, 23)}
        {number(
          "srs_learn_ahead",
          "learnAheadMinutes",
          0,
          undefined,
          "srs_learn_ahead_help",
        )}
        <p className="setting-footnote">{t("srs_single_step_help")}</p>
      </details>
      <details>
        <summary>{t("srs_workload")}</summary>
        {number(
          "srs_review_limit",
          "reviewLimit",
          1,
          undefined,
          "srs_limit_help",
        )}
        <label className="setting-row">
          <strong>{t("srs_fuzz")}</strong>
          <input
            type="checkbox"
            role="switch"
            checked={settings.intervalFuzz}
            onChange={(event) =>
              void onChange({ intervalFuzz: event.target.checked })
            }
          />
        </label>
      </details>
      <details>
        <summary>{t("srs_dynamic_retention")}</summary>
        <label className="setting-row">
          <strong>{t("srs_frequency_retention")}</strong>
          <input
            type="checkbox"
            role="switch"
            checked={settings.dynamicRetention}
            onChange={(event) =>
              void onChange({ dynamicRetention: event.target.checked })
            }
          />
        </label>
        <p className="setting-footnote">{t("srs_rank_help")}</p>
        {dictionaries
          .filter((dictionary) => dictionary.frequencyCount > 0)
          .map((dictionary) => (
            <label key={dictionary.id} className="setting-row">
              <span>{dictionary.index.title}</span>
              <input
                type="checkbox"
                checked={isRankSource(dictionary, settings)}
                onChange={(event) =>
                  void onChange({
                    rankSources: {
                      ...settings.rankSources,
                      [dictionary.id]: event.target.checked,
                    },
                  })
                }
              />
            </label>
          ))}
        <div className="srs-bands">
          {bands.map((band, index) => (
            <div className="row" key={index}>
              <label>
                {band.upTo === null ? t("srs_rank_above") : t("srs_rank_up_to")}
                {band.upTo !== null && (
                  <input
                    aria-label={t("srs_rank_up_to")}
                    type="number"
                    min={1}
                    value={band.upTo}
                    onChange={(event) =>
                      setBands(
                        bands.map((row, i) =>
                          i === index
                            ? { ...row, upTo: Number(event.target.value) }
                            : row,
                        ),
                      )
                    }
                  />
                )}
              </label>
              <label>
                {t("desired_retention")}
                <input
                  type="number"
                  min={70}
                  max={99}
                  value={Math.round(band.retention * 100)}
                  onChange={(event) =>
                    setBands(
                      bands.map((row, i) =>
                        i === index
                          ? {
                              ...row,
                              retention: Number(event.target.value) / 100,
                            }
                          : row,
                      ),
                    )
                  }
                />
                %
              </label>
              {band.upTo !== null && (
                <button
                  type="button"
                  className="quiet"
                  onClick={() => setBands(bands.filter((_, i) => i !== index))}
                >
                  {t("srs_remove_band")}
                </button>
              )}
            </div>
          ))}
          <div className="row">
            <button
              type="button"
              onClick={() =>
                setBands([
                  ...bands.slice(0, -1),
                  { upTo: (bands.at(-2)?.upTo ?? 0) + 1000, retention: 0.8 },
                  bands.at(-1)!,
                ])
              }
            >
              {t("srs_add_band")}
            </button>
            <button
              type="button"
              onClick={() => void onChange({ retentionBands: bands })}
            >
              {t("srs_save_bands")}
            </button>
          </div>
        </div>
      </details>
      <details>
        <summary>{t("srs_leeches")}</summary>
        {number(
          "srs_leech_threshold",
          "leechThreshold",
          0,
          undefined,
          "srs_leech_help",
        )}
        <label className="setting-row">
          <strong>{t("srs_leech_action")}</strong>
          <Select
            value={settings.leechAction}
            onValueChange={(value) =>
              void onChange({ leechAction: value as Settings["leechAction"] })
            }
          >
            <SelectOption value="suspend">{t("suspend")}</SelectOption>
            <SelectOption value="mark">{t("srs_mark_only")}</SelectOption>
          </Select>
        </label>
      </details>
      <details>
        <summary>{t("srs_maintenance")}</summary>
        <p className="setting-footnote">{t("srs_reschedule_help")}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void task(async () => {
              let after = "",
                count = 0;
              do {
                const result = await srsClient({ action: "reschedule", after });
                count += result.count;
                after = result.cursor ?? "";
                setMessage(t("srs_rescheduled", { count }));
              } while (after);
            })
          }
        >
          {t("srs_reschedule")}
        </button>
        {settings.algorithm === "rwkv" && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void task(async () => {
                await srsClient({ action: "resetRwkv" });
                await prepare();
                setMessage(t("rwkv_ready"));
              })
            }
          >
            {t("rwkv_rebuild")}
          </button>
        )}
      </details>
    </div>
  );
}
