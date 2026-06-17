import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronRight,
  FileText,
  Link2,
  Mail,
  RotateCcw,
  UserRound,
  Video,
  XCircle
} from "lucide-react";
import { statusClasses, formatStatusLabel } from "../../components/statusStyles";

const ACTION_ICONS = [
  { match: /approved|accepted/, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
  { match: /rejected/, icon: XCircle, color: "text-red-600 bg-red-50" },
  { match: /resubmi/, icon: RotateCcw, color: "text-orange-600 bg-orange-50" },
  { match: /video/, icon: Video, color: "text-purple-600 bg-purple-50" },
  { match: /document|consent/, icon: FileText, color: "text-blue-600 bg-blue-50" },
  { match: /link/, icon: Link2, color: "text-cyan-600 bg-cyan-50" },
  { match: /email|reminder/, icon: Mail, color: "text-indigo-600 bg-indigo-50" },
  { match: /login|file_accessed/, icon: UserRound, color: "text-gray-600 bg-gray-100" },
  { match: /auto_check/, icon: Bot, color: "text-teal-600 bg-teal-50" }
];

const ACTOR_STYLES = {
  reviewer: "bg-amber-50 text-amber-700",
  admin: "bg-purple-50 text-purple-700",
  buyer: "bg-blue-50 text-blue-700",
  system: "bg-gray-100 text-gray-500"
};

function actionVisual(action = "") {
  return (
    ACTION_ICONS.find((item) => item.match.test(action)) || {
      icon: Activity,
      color: "text-gray-600 bg-gray-100"
    }
  );
}

function StatusChip({ status }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ring-1 ring-inset ${statusClasses(
        status
      )}`}
    >
      {formatStatusLabel(status)}
    </span>
  );
}

export default function AuditTimeline({ logs = [] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-navy">Audit timeline</h2>
      <p className="mt-1 text-sm text-gray-500">
        Complete trail of buyer, system, and reviewer actions — newest first.
      </p>

      {logs.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-gray-50 p-6 text-center text-sm text-gray-500">
          No audit logs available.
        </div>
      ) : (
        <div className="relative mt-6">
          <div className="absolute bottom-3 left-[19px] top-3 w-px bg-gray-200" />

          <div className="space-y-1">
            {logs.map((log) => {
              const visual = actionVisual(log.action);

              return (
                <div
                  key={log.id}
                  className="relative flex gap-4 rounded-2xl p-2.5 transition hover:bg-gray-50"
                >
                  <div
                    className={`relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${visual.color}`}
                  >
                    <visual.icon size={16} />
                  </div>

                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-bold capitalize text-gray-950">
                        {log.action?.replaceAll("_", " ")}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          ACTOR_STYLES[log.actorType] || ACTOR_STYLES.system
                        }`}
                      >
                        {log.actorName || log.actorType}
                      </span>
                    </div>

                    {(log.oldStatus || log.newStatus) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {log.oldStatus && <StatusChip status={log.oldStatus} />}
                        {log.oldStatus && log.newStatus && (
                          <ChevronRight size={12} className="text-gray-300" />
                        )}
                        {log.newStatus && <StatusChip status={log.newStatus} />}
                      </div>
                    )}

                    {log.metadata?.remarks && (
                      <p className="mt-1.5 text-xs italic text-gray-500">
                        “{log.metadata.remarks}”
                      </p>
                    )}

                    {log.metadata?.documentName && (
                      <p className="mt-1 text-xs text-gray-500">
                        {log.metadata.documentName}
                      </p>
                    )}

                    {log.metadata && (
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-[11px] font-semibold text-gray-400 hover:text-gray-600">
                          Details
                        </summary>
                        <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-gray-50 p-3 text-[11px] leading-5 text-gray-600">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>

                  <p
                    className="shrink-0 pt-1 text-right text-xs font-medium text-gray-400"
                    title={new Date(log.createdAt).toLocaleString()}
                  >
                    {formatDateTime(log.createdAt)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function formatDateTime(date) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(date));
}
