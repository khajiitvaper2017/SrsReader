import {
  Badge,
  Group,
  HoverCard,
  Progress,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import type { ReactNode } from "react";
import type { Responses } from "@/srs/contracts";
import type { SessionAnswer } from "@/srs/hooks/useReviewSession";
import { number, t } from "@/shared/i18n/i18n";

/** Session counts and review actions, with the answer count in progress details. */
export function SessionProgress({
  queue,
  answers,
  back,
  children,
}: {
  queue: Responses["queue"];
  answers: SessionAnswer[];
  back: ReactNode;
  children: ReactNode;
}) {
  const reviews = queue.reviews + queue.learning + queue.relearning;
  const remaining = queue.words.length;
  const total = answers.length + remaining;
  const label = t("session_progress_count", {
    answered: number(answers.length),
    total: number(total),
  });
  const grades = (["again", "hard", "good", "easy"] as const).map(
    (label, index) => ({
      label: t(label),
      color: ["red", "orange", "green", "blue"][index],
      count: answers.filter((answer) => answer.rating === index + 1).length,
    }),
  );
  return (
    <Stack gap="xs" data-srs-reader>
      <Group
        wrap="nowrap"
        align="center"
        gap="xs"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {back}
        <Group flex={1} miw={0} align="center" gap={4}>
          <Badge color="blue" size="sm">
            {t("session_queue_new", { value: number(queue.fresh) })}
          </Badge>
          <Badge color="green" size="sm">
            {t("session_queue_review", { value: number(reviews) })}
          </Badge>
        </Group>
        {children}
      </Group>
      <HoverCard
        events={{ hover: true, focus: true, touch: true }}
        role="tooltip"
        withArrow
      >
        <HoverCard.Target>
          <UnstyledButton aria-label={t("session_progress")} py="xs" w="100%">
            <Progress.Root size="xs" aria-label={label}>
              {grades.map((grade) => (
                <Progress.Section
                  key={grade.label}
                  color={grade.color}
                  value={total ? (grade.count / total) * 100 : 0}
                  aria-label={`${grade.label}: ${number(grade.count)}`}
                />
              ))}
            </Progress.Root>
          </UnstyledButton>
        </HoverCard.Target>
        <HoverCard.Dropdown maw="calc(100vw - 24px)">
          <Stack gap="xs">
            <Group gap="xs">
              {grades.map((grade) => (
                <Badge
                  key={grade.label}
                  color={grade.color}
                  size="sm"
                  variant="dot"
                >
                  {grade.label} {number(grade.count)}
                </Badge>
              ))}
            </Group>
            <Text variant="supporting">{label}</Text>
            {queue.learning + queue.relearning > 0 && (
              <Text variant="supporting">
                {t("session_progress_pending", {
                  value: number(queue.learning + queue.relearning),
                })}
              </Text>
            )}
            {!!queue.ahead && (
              <Text variant="supporting">
                {t("srs_queue_ahead", { count: queue.ahead })}
              </Text>
            )}
          </Stack>
        </HoverCard.Dropdown>
      </HoverCard>
    </Stack>
  );
}
