import { useState } from "react";

/**
 * Dependency-free vertical bar chart (CSS only).
 * data: [{ label, value, color? }]  — color is any CSS color (defaults to navy).
 */
export default function BarChart({ data = [], height = 240, valueSuffix = "" }) {
  const [hovered, setHovered] = useState(null);

  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400"
        style={{ height }}
      >
        No data yet
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        className="flex items-end gap-3 sm:gap-4"
        style={{ height }}
      >
        {data.map((d, index) => {
          const value = Number(d.value) || 0;
          const pct = Math.round((value / max) * 100);
          const isHovered = hovered === index;

          return (
            <div
              key={`${d.label}-${index}`}
              className="group relative flex h-full flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* hover value bubble */}
              <div
                className={`absolute -top-1 z-10 -translate-y-full rounded-lg bg-navy px-2.5 py-1 text-xs font-semibold text-white shadow-lg transition ${
                  isHovered ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                {value}
                {valueSuffix}
              </div>

              <div
                className="w-full max-w-[44px] rounded-t-lg transition-all duration-300"
                style={{
                  height: `${Math.max(pct, value > 0 ? 4 : 0)}%`,
                  backgroundColor: d.color || "var(--color-navy)",
                  opacity: hovered === null || isHovered ? 1 : 0.55
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex gap-3 sm:gap-4">
        {data.map((d, index) => (
          <div
            key={`label-${d.label}-${index}`}
            className="flex-1 truncate text-center text-[11px] font-medium capitalize text-slate-500"
            title={d.label}
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}
