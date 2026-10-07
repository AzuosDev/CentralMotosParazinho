import { MONTH_NAMES } from "./period";
import type { PeriodFilter } from "./period";
import { cn } from "../../lib/utils";

const selectClass =
  "rounded-xl border border-bg-muted bg-bg-card px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent-brand";

export function PeriodSelector({
  value,
  onChange,
}: {
  value: PeriodFilter;
  onChange: (next: PeriodFilter) => void;
}) {
  const years = Array.from({ length: 8 }, (_, index) => value.year + 1 - index);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Granularidade do período"
        className="flex rounded-xl bg-bg-muted p-1"
      >
        {(["month", "quarter", "year"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange({ ...value, period: option })}
            aria-pressed={value.period === option}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              value.period === option
                ? "bg-bg-card text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {option === "month" ? "Mês" : option === "quarter" ? "Trimestre" : "Ano"}
          </button>
        ))}
      </div>

      {value.period === "month" && (
        <select
          aria-label="Mês"
          value={value.month}
          onChange={(event) =>
            onChange({ ...value, month: Number(event.target.value) })
          }
          className={selectClass}
        >
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
      )}

      {value.period === "quarter" && (
        <select
          aria-label="Trimestre"
          value={value.quarter}
          onChange={(event) =>
            onChange({ ...value, quarter: Number(event.target.value) })
          }
          className={selectClass}
        >
          {[1, 2, 3, 4].map((quarter) => (
            <option key={quarter} value={quarter}>
              {quarter}º trimestre
            </option>
          ))}
        </select>
      )}

      <select
        aria-label="Ano"
        value={value.year}
        onChange={(event) =>
          onChange({ ...value, year: Number(event.target.value) })
        }
        className={selectClass}
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  );
}
