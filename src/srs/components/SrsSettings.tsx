import {
  Accordion,
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  SimpleGrid,
  NumberInput,
  Progress,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { isRankSource } from "@/dictionaries/frequency";
import type { Dictionary } from "@/dictionaries/model";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { srsClient } from "@/srs/client";
import { useSrsSettings } from "@/srs/hooks/useSrsSettings";
import { SrsProgress } from "@/srs/components/SrsProgress";
import { learningStepsSchema } from "@/srs/preferences";
import { useState } from "react";
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
    <NumberInput
      key={String(value)}
      min={min}
      max={max}
      step={1}
      defaultValue={value ?? ""}
      placeholder={t("srs_unlimited")}
      onBlur={(event) => {
        const draft = event.currentTarget.value;
        onChange(
          draft === ""
            ? null
            : Math.min(max ?? Infinity, Math.max(min, Number(draft))),
        );
      }}
      label={label}
      description={help}
    />
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
  const [pendingModel, setPendingModel] = useState<{
    algorithm: Settings["algorithm"];
    rwkvMode: Settings["rwkvMode"];
  } | null>(null);
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
    <Stack>
      <Modal
        opened={pendingModel !== null}
        onClose={() => setPendingModel(null)}
        title={t("srs_switch_model")}
      >
        <Stack>
          <Text>{t("srs_switch_model_confirm")}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setPendingModel(null)}>
              {t("cancel")}
            </Button>
            <Button
              onClick={() => {
                const next = pendingModel!;
                setPendingModel(null);
                void task(async () => {
                  if (next.algorithm === "rwkv") await prepare();
                  await onChange(
                    await srsClient({ action: "activateAlgorithm", ...next }),
                  );
                  setMessage(t("srs_algorithm_ready"));
                });
              }}
            >
              {t("srs_switch_and_reschedule")}
            </Button>
          </Group>
        </Stack>
      </Modal>
      <SrsProgress />
      <Select
        label={t("srs_algorithm")}
        description={t("rwkv_download_help")}
        value={settings.algorithm}
        disabled={busy}
        data={[
          { value: "fsrs", label: "FSRS-6 (ts-fsrs 5.4.2)" },
          { value: "rwkv", label: "RWKV w64 (SM55)" },
        ]}
        onChange={(algorithm) => {
          if (
            (algorithm === "fsrs" || algorithm === "rwkv") &&
            algorithm !== settings.algorithm
          )
            setPendingModel({ algorithm, rwkvMode: settings.rwkvMode });
        }}
      />
      {settings.algorithm === "rwkv" && (
        <Select
          label={t("rwkv_mode")}
          description={t("rwkv_mode_help")}
          value={settings.rwkvMode}
          disabled={busy}
          data={[
            { value: "curve", label: t("rwkv_mode_curve") },
            { value: "instant", label: t("rwkv_mode_instant") },
          ]}
          onChange={(value) => {
            if (
              (value === "curve" || value === "instant") &&
              value !== settings.rwkvMode
            )
              setPendingModel({
                algorithm: settings.algorithm,
                rwkvMode: value,
              });
          }}
        />
      )}
      {settings.algorithm === "rwkv" && status && (
        <Text variant="supporting">
          {status.ready
            ? t("rwkv_ready")
            : t("rwkv_replaying", {
                processed: status.processed,
                total: status.total,
              })}
        </Text>
      )}
      {message && <Text role="status">{message}</Text>}
      {busy && (
        <Progress.Root
          role="progressbar"
          aria-label={t("rwkv_preparing")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={
            status?.total ? (status.processed / status.total) * 100 : undefined
          }
        >
          <Progress.Section
            withAria={false}
            value={
              status?.total ? (status.processed / status.total) * 100 : 100
            }
            animated
          />
        </Progress.Root>
      )}
      <Accordion multiple>
        <Accordion.Item value="learning">
          <Accordion.Control>{t("srs_learning")}</Accordion.Control>
          <Accordion.Panel>
            <Stack>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                {(["learningSteps", "relearningSteps"] as const).map((key) => (
                  <TextInput
                    key={settings[key].join(" ") + key}
                    label={t(
                      key === "learningSteps"
                        ? "srs_learning_steps"
                        : "srs_relearning_steps",
                    )}
                    description={t("srs_steps_help")}
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
              </SimpleGrid>
              <Text variant="supporting">{t("srs_single_step_help")}</Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="workload">
          <Accordion.Control>{t("srs_workload")}</Accordion.Control>
          <Accordion.Panel>
            <Stack>
              {number(
                "srs_review_limit",
                "reviewLimit",
                1,
                undefined,
                "srs_limit_help",
              )}
              <Switch
                checked={settings.intervalFuzz}
                onChange={(event) =>
                  void onChange({ intervalFuzz: event.target.checked })
                }
                aria-label={t("srs_fuzz")}
                label={t("srs_fuzz")}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="dynamic-retention">
          <Accordion.Control>{t("srs_dynamic_retention")}</Accordion.Control>
          <Accordion.Panel>
            <Stack>
              <Switch
                checked={settings.dynamicRetention}
                onChange={(event) =>
                  void onChange({ dynamicRetention: event.target.checked })
                }
                aria-label={t("srs_frequency_retention")}
                label={t("srs_frequency_retention")}
              />
              <Text variant="supporting">{t("srs_rank_help")}</Text>
              {dictionaries
                .filter((dictionary) => dictionary.frequencyCount > 0)
                .map((dictionary) => (
                  <Checkbox
                    checked={isRankSource(dictionary, settings)}
                    onChange={(event) =>
                      void onChange({
                        rankSources: {
                          ...settings.rankSources,
                          [dictionary.id]: event.target.checked,
                        },
                      })
                    }
                    label={<span>{dictionary.index.title}</span>}
                    key={dictionary.id}
                  />
                ))}
              <Stack>
                {bands.map((band, index) => (
                  <SimpleGrid key={index} cols={{ base: 1, sm: 3 }}>
                    {band.upTo === null ? (
                      <Text pt="xl">{t("srs_rank_above")}</Text>
                    ) : (
                      <NumberInput
                        label={t("srs_rank_up_to")}
                        min={1}
                        value={band.upTo}
                        onChange={(value) => {
                          if (value !== "")
                            setBands(
                              bands.map((row, i) =>
                                i === index
                                  ? { ...row, upTo: Number(value) }
                                  : row,
                              ),
                            );
                        }}
                      />
                    )}
                    <NumberInput
                      label={t("desired_retention")}
                      min={70}
                      max={99}
                      suffix="%"
                      value={Math.round(band.retention * 100)}
                      onChange={(value) => {
                        if (value !== "")
                          setBands(
                            bands.map((row, i) =>
                              i === index
                                ? { ...row, retention: Number(value) / 100 }
                                : row,
                            ),
                          );
                      }}
                    />
                    {band.upTo !== null && (
                      <Group align="end">
                        <Button
                          onClick={() =>
                            setBands(bands.filter((_, i) => i !== index))
                          }
                          variant="subtle"
                        >
                          {t("srs_remove_band")}
                        </Button>
                      </Group>
                    )}
                  </SimpleGrid>
                ))}
                <Group align="center">
                  <Button
                    type="button"
                    onClick={() =>
                      setBands([
                        ...bands.slice(0, -1),
                        {
                          upTo: (bands.at(-2)?.upTo ?? 0) + 1000,
                          retention: 0.8,
                        },
                        bands.at(-1)!,
                      ])
                    }
                    variant="default"
                  >
                    {t("srs_add_band")}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void onChange({ retentionBands: bands })}
                    variant="default"
                  >
                    {t("srs_save_bands")}
                  </Button>
                </Group>
              </Stack>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="leeches">
          <Accordion.Control>{t("srs_leeches")}</Accordion.Control>
          <Accordion.Panel>
            <Stack>
              {number(
                "srs_leech_threshold",
                "leechThreshold",
                0,
                undefined,
                "srs_leech_help",
              )}
              <Select
                label={t("srs_leech_action")}
                value={settings.leechAction}
                onChange={(value) =>
                  void onChange({
                    leechAction: value as Settings["leechAction"],
                  })
                }
                data={[
                  { value: "suspend", label: t("suspend") },
                  { value: "mark", label: t("srs_mark_only") },
                ]}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="maintenance">
          <Accordion.Control>{t("srs_maintenance")}</Accordion.Control>
          <Accordion.Panel>
            <Stack>
              <Text variant="supporting">{t("srs_reschedule_help")}</Text>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    let after = "",
                      count = 0;
                    do {
                      const result = await srsClient({
                        action: "reschedule",
                        after,
                      });
                      count += result.count;
                      after = result.cursor ?? "";
                      setMessage(t("srs_rescheduled", { count }));
                    } while (after);
                  })
                }
                variant="default"
              >
                {t("srs_reschedule")}
              </Button>
              {settings.algorithm === "rwkv" && (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      await srsClient({ action: "resetRwkv" });
                      await prepare();
                      setMessage(t("rwkv_ready"));
                    })
                  }
                  variant="default"
                >
                  {t("rwkv_rebuild")}
                </Button>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
