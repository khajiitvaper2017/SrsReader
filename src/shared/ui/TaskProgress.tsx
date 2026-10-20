import type { ImportProgress } from "@/shared/download";
import { downloadSize, number } from "@/shared/i18n/i18n";

export function TaskProgress({ progress }: { progress: ImportProgress }) {
  const { phase, done, total, unit } = progress;
  const percent = total ? Math.min(100, (done / total) * 100) : undefined;
  const detail =
    unit === "bytes"
      ? `${downloadSize(done)}${total ? ` / ${downloadSize(total)}` : ""}`
      : total
        ? `${number(Math.floor(done))} / ${number(total)}`
        : done
          ? number(done)
          : "";
  return (
    <div className="task-progress">
      <div className="task-progress-label">
        <span>{phase}</span>
        <span>
          {detail}
          {percent !== undefined &&
            ` · ${number(percent / 100, { style: "percent", maximumFractionDigits: 0 })}`}
        </span>
      </div>
      <div
        className={`task-progress-track ${percent === undefined ? "indeterminate" : ""}`}
        role="progressbar"
        aria-label={phase}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={detail || undefined}
      >
        <span
          style={percent === undefined ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
