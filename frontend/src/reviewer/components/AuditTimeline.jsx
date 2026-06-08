export default function AuditTimeline({ logs = [] }) {
  return (
    <section className="rounded-[2rem] border border-gray-200/80 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-gray-950">Audit timeline</h2>
      <p className="mt-1 text-sm text-gray-500">
        Complete trail of buyer, system, and reviewer actions.
      </p>

      <div className="mt-6 space-y-4">
        {logs.length === 0 && (
          <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500">
            No audit logs available.
          </div>
        )}

        {logs.map((log) => (
          <div key={log.id} className="flex gap-4">
            <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-gray-950" />

            <div className="min-w-0 flex-1 rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-gray-950">
                  {log.action?.replaceAll("_", " ")}
                </p>

                <p className="text-xs text-gray-500">
                  {formatDateTime(log.createdAt)}
                </p>
              </div>

              <p className="mt-1 text-xs text-gray-500">
                Actor: {log.actorType}
                {log.actorId ? ` • ${log.actorId}` : ""}
              </p>

              {(log.oldStatus || log.newStatus) && (
                <p className="mt-2 text-xs text-gray-600">
                  {log.oldStatus || "—"} → {log.newStatus || "—"}
                </p>
              )}

              {log.metadata && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-gray-500">
                    Metadata
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-white p-3 text-xs text-gray-600">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatDateTime(date) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(date));
}
