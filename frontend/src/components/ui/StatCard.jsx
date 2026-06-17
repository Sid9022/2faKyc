const TONES = {
  navy: "bg-navy/5 text-navy",
  blue: "bg-blue-50 text-blue-600",
  amber: "bg-amber-50 text-amber-600",
  green: "bg-green-50 text-green-600",
  red: "bg-red-50 text-red-600",
  purple: "bg-violet-50 text-violet-600",
  indigo: "bg-indigo-50 text-indigo-600"
};

export default function StatCard({ icon: Icon, value, label, sub, tone = "navy" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
            {label}
          </p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-navy">
            {value}
          </p>
          {sub ? (
            <p className="mt-1 truncate text-xs font-medium text-slate-400">{sub}</p>
          ) : null}
        </div>
        {Icon ? (
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              TONES[tone] || TONES.navy
            }`}
          >
            <Icon size={18} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
