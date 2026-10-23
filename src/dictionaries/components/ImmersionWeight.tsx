import { Button, Group, NumberInput, Stack, Text } from "@mantine/core";
import type { Dictionary } from "@/dictionaries/model";
import { t } from "@/shared/i18n/i18n";
import { useEffect, useState } from "react";

export function ImmersionWeight({
  dictionary,
  disabled,
  onSave,
}: {
  dictionary: Dictionary;
  disabled: boolean;
  onSave: (weight: number) => void;
}) {
  const saved = dictionary.immersion!.secondaryWeight;
  const [weight, setWeight] = useState<string | number>(saved);
  useEffect(() => setWeight(saved), [saved]);
  return (
    <Stack gap="xs">
      <Text variant="supporting">{t("immersion_collection_help")}</Text>
      <Group align="end">
        <NumberInput
          label={t("immersion_secondary_weight")}
          description={t("immersion_score_help")}
          min={0}
          max={1}
          step={0.1}
          decimalScale={2}
          value={weight}
          onChange={setWeight}
          disabled={disabled}
        />
        <Button
          disabled={disabled || typeof weight !== "number" || weight === saved}
          onClick={() => {
            if (typeof weight === "number") onSave(weight);
          }}
        >
          {t("save")}
        </Button>
      </Group>
    </Stack>
  );
}
