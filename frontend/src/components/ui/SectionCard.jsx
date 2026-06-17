export default function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className = "",
  bodyClassName = ""
}) {
  const hasHeader = title || subtitle || actions;

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}
    >
      {hasHeader ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-base font-bold text-navy">{title}</h2>
            ) : null}
            {subtitle ? (
              <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}

      <div className={hasHeader ? `mt-5 ${bodyClassName}` : bodyClassName}>{children}</div>
    </section>
  );
}
