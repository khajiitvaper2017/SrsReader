import { SimpleGrid, Stack, Title } from "@mantine/core";
import type { Settings } from "@/settings/model";
import { t } from "@/shared/i18n/i18n";
import { BindingInput } from "@/shared/ui/BindingInput";
import {
  reviewActions,
  reviewBindingKey,
  type ReviewAction,
} from "@/srs/controls";
import { useState } from "react";

export function ReviewControls({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => Promise<void>;
}) {
  const [error, setError] = useState<{
    action: ReviewAction;
    message: string;
  }>();
  return (
    <Stack>
      <Title order={2}>{t("review_controls")}</Title>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {reviewActions.map((action) => (
          <BindingInput
            key={action}
            label={t(action === "flip" ? "review_flip_good" : action)}
            value={settings.reviewBindings[action]}
            error={error?.action === action ? error.message : undefined}
            onChange={(binding) => {
              if (binding?.type === "hover" || binding?.type === "touch")
                return;
              const conflict =
                binding &&
                reviewActions.find(
                  (other) =>
                    other !== action &&
                    settings.reviewBindings[other] &&
                    reviewBindingKey(settings.reviewBindings[other]!) ===
                      reviewBindingKey(binding),
                );
              if (conflict) {
                setError({
                  action,
                  message: t("binding_used_by", {
                    action: t(
                      conflict === "flip" ? "review_flip_good" : conflict,
                    ),
                  }),
                });
                return;
              }
              setError(undefined);
              void onChange({
                reviewBindings: {
                  ...settings.reviewBindings,
                  [action]: binding,
                },
              });
            }}
          />
        ))}
      </SimpleGrid>
    </Stack>
  );
}
