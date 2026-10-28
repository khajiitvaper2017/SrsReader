import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import {
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";

export function TimedReviewSettings({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => Promise<void>;
}) {
  const timer = settings.timedReview;
  const [seconds, setSeconds] = useState<{
    questionSeconds: number | string;
    answerSeconds: number | string;
  }>({
    questionSeconds: timer.questionSeconds,
    answerSeconds: timer.answerSeconds,
  });
  useEffect(() => {
    setSeconds({
      questionSeconds: timer.questionSeconds,
      answerSeconds: timer.answerSeconds,
    });
  }, [timer.questionSeconds, timer.answerSeconds]);
  const update = (patch: Partial<Settings["timedReview"]>) =>
    onChange({ timedReview: { ...timer, ...patch } });
  function saveSeconds(field: "questionSeconds" | "answerSeconds") {
    const raw = seconds[field];
    const value =
      typeof raw === "number"
        ? Math.max(field === "questionSeconds" ? 1 : 0, Math.min(600, raw))
        : timer[field];
    setSeconds((current) => ({ ...current, [field]: value }));
    void update({ [field]: value });
  }
  return (
    <Paper>
      <Stack>
        <Title order={2}>{t("timed_review")}</Title>
        <Text variant="supporting">{t("timed_review_help")}</Text>
        <Switch
          label={t("timed_review_default")}
          checked={timer.enabled}
          onChange={(event) =>
            void update({ enabled: event.currentTarget.checked })
          }
        />
        <Switch
          label={t("timed_review_bar")}
          checked={timer.showBar}
          onChange={(event) =>
            void update({ showBar: event.currentTarget.checked })
          }
        />
        <Switch
          label={t("timed_review_skip_new")}
          checked={timer.skipNew}
          onChange={(event) =>
            void update({ skipNew: event.currentTarget.checked })
          }
        />
        <Switch
          label={t("timed_review_question")}
          checked={timer.questionEnabled}
          onChange={(event) =>
            void update({ questionEnabled: event.currentTarget.checked })
          }
        />
        {timer.questionEnabled && (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <NumberInput
              label={t("timed_review_seconds")}
              min={1}
              max={600}
              allowDecimal={false}
              value={seconds.questionSeconds}
              onChange={(value) =>
                setSeconds((current) => ({
                  ...current,
                  questionSeconds: value,
                }))
              }
              onBlur={() => saveSeconds("questionSeconds")}
            />
            <Select
              label={t("timed_review_timeout")}
              allowDeselect={false}
              value={timer.questionAction}
              onChange={(value) =>
                void update({
                  questionAction: value as typeof timer.questionAction,
                })
              }
              data={[
                { value: "reveal", label: t("timed_review_reveal") },
                { value: "fail", label: t("timed_review_reveal_fail") },
                { value: "alert", label: t("timed_review_alert_only") },
              ]}
            />
          </SimpleGrid>
        )}
        <Switch
          label={t("timed_review_answer")}
          checked={timer.answerEnabled}
          onChange={(event) =>
            void update({ answerEnabled: event.currentTarget.checked })
          }
        />
        {timer.answerEnabled && (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <NumberInput
              label={t("timed_review_seconds")}
              description={t("timed_review_zero_seconds")}
              min={0}
              max={600}
              allowDecimal={false}
              value={seconds.answerSeconds}
              onChange={(value) =>
                setSeconds((current) => ({ ...current, answerSeconds: value }))
              }
              onBlur={() => saveSeconds("answerSeconds")}
            />
            <Select
              label={t("timed_review_timeout")}
              allowDeselect={false}
              value={timer.answerAction}
              onChange={(value) =>
                void update({
                  answerAction: value as typeof timer.answerAction,
                })
              }
              data={[
                { value: "softFail", label: t("timed_review_soft_fail") },
                { value: "fail", label: t("timed_review_fail") },
              ]}
            />
          </SimpleGrid>
        )}
        <Text variant="supporting">{t("timed_review_grace_help")}</Text>
        <Switch
          label={t("timed_review_sound")}
          checked={timer.sound}
          onChange={(event) =>
            void update({ sound: event.currentTarget.checked })
          }
        />
      </Stack>
    </Paper>
  );
}
