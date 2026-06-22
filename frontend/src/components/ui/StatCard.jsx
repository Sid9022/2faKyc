const TONES = {
  navy: "bg-navy/5 text-navy",
  blue: "bg-blue-50 text-blue-600",
  amber: "bg-amber-50 text-amber-600",
  green: "bg-green-50 text-green-600",
  red: "bg-red-50 text-red-600",
  purple: "bg-violet-50 text-violet-600",
  indigo: "bg-indigo-50 text-indigo-600"
};

export default function StatCard({ icon: Icon, value, label, sub, tone = "navy", onClick }) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 flex flex-col justify-between h-full w-full text-left ${
        onClick ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : "hover:shadow-md"
      }`}
    >
      <div>
        {Icon ? (
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl mb-4 ${
              TONES[tone] || TONES.navy
            }`}
          >
            <Icon size={18} />
          </div>
        ) : null}
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 leading-tight">
          {label}
        </p>
        <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-navy">
          {value}
        </p>
      </div>
      {sub ? (
        <p className="mt-2.5 truncate text-xs font-semibold text-slate-500" title={sub}>
          {sub}
        </p>
      ) : null}
    </Component>
  );
}

