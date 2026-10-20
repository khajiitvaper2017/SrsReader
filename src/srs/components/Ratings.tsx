import { number, t } from "@/shared/i18n/i18n";

export function intervalLabel(time: number) {
  const minutes = Math.max(1, Math.round((time - Date.now()) / 60000));
  if (minutes < 60) return t("interval_minutes", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("interval_hours", { count: hours });
  const days = Math.round(hours / 24);
  return days < 365
    ? t("interval_days", { count: days })
    : t("interval_years", {
        value: number(days / 365, { maximumFractionDigits: 1 }),
      });
}

export function Ratings({
  times,
  disabled,
  onGrade,
  onlyAgainGood,
}: {
  times: number[];
  disabled: boolean;
  onGrade: (rating: number) => void;
  onlyAgainGood: boolean;
}) {
  return (
    <div className="ratings">
      {[t("again"), t("hard"), t("good"), t("easy")].map((label, i) =>
        onlyAgainGood && i !== 0 && i !== 2 ? null : (
          <button
            key={label}
            className={`rating rating-${i + 1}`}
            title={times[i] ? intervalLabel(times[i]!) : undefined}
            disabled={disabled}
            onClick={() => onGrade(i + 1)}
          >
            <span>{label}</span>
            <small>{times[i] ? intervalLabel(times[i]!) : "—"}</small>
          </button>
        ),
      )}
    </div>
  );
}
