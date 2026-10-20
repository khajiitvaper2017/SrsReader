import {
  Accordion,
  Button,
  Checkbox,
  Group,
  NativeSelect,
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
import { learningStepsSchema } from "@/srs/preferences";
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
    <Group gap="xs" justify="space-between" align="center" wrap="nowrap">
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong>{label}</strong>
        {help && (
          <Text component="small" size="xs" c="dimmed" display="block">
            {help}
          </Text>
        )}
      </span>
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
        aria-label={label}
        w={160}
        maw="50%"
      />
    </Group>
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
    <Stack gap="xs">
      <Group gap="xs" justify="space-between" align="center" wrap="nowrap">
        <strong style={{ flex: 1, minWidth: 0 }}>{t("srs_algorithm")}</strong>
        <NativeSelect
          value={settings.algorithm}
          disabled={busy}
          onChange={(event) => {
            const algorithm = event.currentTarget.value;
            return void task(async () => {
              if (algorithm === "rwkv") await prepare();
              await onChange(
                await srsClient({
                  action: "activateAlgorithm",
                  algorithm: algorithm as Settings["algorithm"],
                }),
              );
              setMessage(t("srs_algorithm_ready"));
            });
          }}
          aria-label={t("srs_algorithm")}
          w={160}
          maw="50%"
        >
          <option value="fsrs">FSRS</option>
          <option value="rwkv">RWKV w64</option>
        </NativeSelect>
      </Group>
      <Text c="dimmed" fz="xs">
        {t("rwkv_download_help")}
      </Text>
      {settings.algorithm === "rwkv" && status && (
        <Text c="dimmed">
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
      <Accordion>
        <Accordion.Item value="settings">
          <Accordion.Control>{t("srs_learning")}</Accordion.Control>
          <Accordion.Panel>
            {(["learningSteps", "relearningSteps"] as const).map((key) => (
              <Group
                key={key}
                gap="xs"
                justify="space-between"
                align="center"
                wrap="nowrap"
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>
                    {t(
                      key === "learningSteps"
                        ? "srs_learning_steps"
                        : "srs_relearning_steps",
                    )}
                  </strong>
                  <Text component="small" size="xs" c="dimmed" display="block">
                    {t("srs_steps_help")}
                  </Text>
                </span>
                <TextInput
                  key={settings[key].join(" ")}
                  defaultValue={settings[key].join(" ")}
                  onBlur={(event) => {
                    const steps = event.target.value.trim()
                      ? event.target.value.trim().split(/\s+/)
                      : [];
                    if (learningStepsSchema.safeParse(steps).success)
                      void onChange({ [key]: steps });
                    else onError(t("srs_invalid_steps"));
                  }}
                  aria-label={t(
                    key === "learningSteps"
                      ? "srs_learning_steps"
                      : "srs_relearning_steps",
                  )}
                  w={160}
                  maw="50%"
                />
              </Group>
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
            <Text c="dimmed" fz="xs">
              {t("srs_single_step_help")}
            </Text>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <Accordion>
        <Accordion.Item value="settings">
          <Accordion.Control>{t("srs_workload")}</Accordion.Control>
          <Accordion.Panel>
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
              label={<strong>{t("srs_fuzz")}</strong>}
            />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <Accordion>
        <Accordion.Item value="settings">
          <Accordion.Control>{t("srs_dynamic_retention")}</Accordion.Control>
          <Accordion.Panel>
            <Switch
              checked={settings.dynamicRetention}
              onChange={(event) =>
                void onChange({ dynamicRetention: event.target.checked })
              }
              aria-label={t("srs_frequency_retention")}
              label={<strong>{t("srs_frequency_retention")}</strong>}
            />
            <Text c="dimmed" fz="xs">
              {t("srs_rank_help")}
            </Text>
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
            <Stack gap="xs">
              {bands.map((band, index) => (
                <Group key={index} gap="xs" align="center">
                  <Group gap="xs" justify="space-between" align="center">
                    {band.upTo === null
                      ? t("srs_rank_above")
                      : t("srs_rank_up_to")}
                    {band.upTo !== null && (
                      <NumberInput
                        aria-label={t("srs_rank_up_to")}
                        min={1}
                        value={band.upTo}
                        onChange={(value) =>
                          setBands(
                            bands.map((row, i) =>
                              i === index
                                ? { ...row, upTo: Number(value) }
                                : row,
                            ),
                          )
                        }
                      />
                    )}
                  </Group>
                  <Group gap="xs" justify="space-between" align="center">
                    {t("desired_retention")}
                    <NumberInput
                      min={70}
                      max={99}
                      value={Math.round(band.retention * 100)}
                      onChange={(value) =>
                        setBands(
                          bands.map((row, i) =>
                            i === index
                              ? {
                                  ...row,
                                  retention: Number(value) / 100,
                                }
                              : row,
                          ),
                        )
                      }
                      aria-label={t("desired_retention")}
                    />
                    %
                  </Group>
                  {band.upTo !== null && (
                    <Button
                      type="button"
                      onClick={() =>
                        setBands(bands.filter((_, i) => i !== index))
                      }
                      variant="subtle"
                    >
                      {t("srs_remove_band")}
                    </Button>
                  )}
                </Group>
              ))}
              <Group gap="xs" align="center">
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
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <Accordion>
        <Accordion.Item value="settings">
          <Accordion.Control>{t("srs_leeches")}</Accordion.Control>
          <Accordion.Panel>
            {number(
              "srs_leech_threshold",
              "leechThreshold",
              0,
              undefined,
              "srs_leech_help",
            )}
            <Group
              gap="xs"
              justify="space-between"
              align="center"
              wrap="nowrap"
            >
              <strong style={{ flex: 1, minWidth: 0 }}>
                {t("srs_leech_action")}
              </strong>
              <NativeSelect
                value={settings.leechAction}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  return void onChange({
                    leechAction: value as Settings["leechAction"],
                  });
                }}
                aria-label={t("srs_leech_action")}
                w={160}
                maw="50%"
              >
                <option value="suspend">{t("suspend")}</option>
                <option value="mark">{t("srs_mark_only")}</option>
              </NativeSelect>
            </Group>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <Accordion>
        <Accordion.Item value="settings">
          <Accordion.Control>{t("srs_maintenance")}</Accordion.Control>
          <Accordion.Panel>
            <Text c="dimmed" fz="xs">
              {t("srs_reschedule_help")}
            </Text>
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
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
