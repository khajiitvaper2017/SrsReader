import { NumberInput } from "@mantine/core";
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
  function save() {
    const value = Number.parseFloat(String(weight));
    if (!Number.isFinite(value)) setWeight(saved);
    else {
      const clamped = Math.min(1, Math.max(0, value));
      setWeight(clamped);
      if (clamped !== saved) onSave(clamped);
    }
  }
  return (
    <NumberInput
      label={t("immersion_secondary_weight")}
      description={t("immersion_score_help")}
      min={0}
      max={1}
      step={0.1}
      allowDecimal
      decimalScale={2}
      value={weight}
      onChange={setWeight}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      disabled={disabled}
    />
  );
}
