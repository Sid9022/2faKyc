import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  CheckCircle2,
  ChevronRight,
  FileCog,
  FileSearch,
  Inbox,
  LayoutDashboard,
  LogOut,
  Mail,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserRound,
  Users,
  Video,
  XCircle
} from "lucide-react";
import {
  createAdminRequirement,
  createAdminUser,
  getAdminDashboard,
  getAdminEmailLogs,
  getAdminEntityTypes,
  getAdminKycCases,
  getAdminSettings,
  getAdminUsers,
  getCurrentUser,
  logout,
  patchAdminSettings,
  updateAdminRequirement,
  updateAdminUser
} from "../api/kycApi";

const NAV = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "cases", label: "KYC cases", icon: FileSearch },
  { key: "requirements", label: "Document config", icon: FileCog },
  { key: "users", label: "Team", icon: Users },
  { key: "settings", label: "Settings", icon: Settings },
  { key: "emails", label: "Email logs", icon: Mail }
];

const STATUS_STYLES = {
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
  resubmission_required: "bg-orange-50 text-orange-700 ring-orange-200",
  submitted: "bg-blue-50 text-blue-700 ring-blue-200",
  under_review: "bg-amber-50 text-amber-700 ring-amber-200",
  in_progress: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  link_sent: "bg-gray-100 text-gray-600 ring-gray-200",
  opened: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  expired: "bg-gray-100 text-gray-500 ring-gray-200"
};

function StatusBadge({ status, label }) {
  const cls = STATUS_STYLES[status] || "bg-gray-100 text-gray-600 ring-gray-200";
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ring-1 ring-inset ${cls}`}
    >
      {String(label || status || "—").replaceAll("_", " ")}
    </span>
  );
}

function timeAgo(date) {
  if (!date) return "—";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
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

export default function AdminPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const user = getCurrentUser();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50 lg:flex">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-gray-200/80 bg-white lg:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-950 text-white">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-sm font-extrabold tracking-tight text-gray-950">
              2Factor KYC
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
              Admin console
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                tab === item.key
                  ? "bg-gray-950 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <item.icon size={17} />
              {item.label}
            </button>
          ))}

          <Link
            to="/reviewer/cases"
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-100"
          >
            <BadgeCheck size={17} />
            Reviewer console
            <ArrowUpRight size={14} className="ml-auto text-gray-400" />
          </Link>
        </nav>

        <div className="border-t border-gray-100 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-950 text-xs font-bold text-white">
              {(user?.fullName || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-gray-950">
                {user?.fullName}
              </p>
              <p className="truncate text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="min-w-0 flex-1">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-10 border-b border-gray-200/80 bg-white/90 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-950 text-white">
                <ShieldCheck size={16} />
              </div>
              <p className="text-sm font-extrabold text-gray-950">Admin console</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-gray-200 p-2 text-gray-600"
            >
              <LogOut size={15} />
            </button>
          </div>
          <div className="flex gap-1 overflow-x-auto px-3 pb-3">
            {NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold ${
                  tab === item.key
                    ? "bg-gray-950 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <item.icon size={13} />
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
          {tab === "overview" && <OverviewTab onOpenCases={() => setTab("cases")} />}
          {tab === "cases" && <CasesTab />}
          {tab === "requirements" && <RequirementsTab />}
          {tab === "users" && <UsersTab />}
          {tab === "settings" && <SettingsTab />}
          {tab === "emails" && <EmailLogsTab />}
        </main>
      </div>
    </div>
  );
}

// ============================ Overview ============================

const ACTION_ICONS = [
  { match: /approved|accepted/, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
  { match: /rejected/, icon: XCircle, color: "text-red-600 bg-red-50" },
  { match: /resubmi/, icon: RotateCcw, color: "text-orange-600 bg-orange-50" },
  { match: /video/, icon: Video, color: "text-purple-600 bg-purple-50" },
  { match: /email|reminder/, icon: Mail, color: "text-blue-600 bg-blue-50" },
  { match: /login/, icon: UserRound, color: "text-gray-600 bg-gray-100" },
  { match: /auto_check/, icon: Bot, color: "text-cyan-600 bg-cyan-50" }
];

function actionVisual(action = "") {
  const found = ACTION_ICONS.find((item) => item.match.test(action));
  return found || { icon: Activity, color: "text-gray-600 bg-gray-100" };
}

const ACTOR_STYLES = {
  reviewer: "bg-amber-50 text-amber-700",
  admin: "bg-purple-50 text-purple-700",
  buyer: "bg-blue-50 text-blue-700",
  system: "bg-gray-100 text-gray-500"
};

function OverviewTab({ onOpenCases }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getAdminDashboard()
      .then((result) => setData(result.data || result))
      .catch((err) => setError(err.response?.data?.message || "Failed to load."));
  }, []);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <LoadingNote />;

  const statuses = data.kycByStatus || {};
  const awaiting = (statuses.submitted || 0) + (statuses.under_review || 0);

  const stats = [
    {
      label: "Total cases",
      value: data.totals?.kycs ?? 0,
      sub: `+${data.totals?.newThisWeek ?? 0} this week`,
      icon: TrendingUp,
      tone: "text-gray-700 bg-gray-100"
    },
    {
      label: "Awaiting review",
      value: awaiting,
      sub: "submitted + under review",
      icon: Inbox,
      tone: "text-blue-700 bg-blue-50"
    },
    {
      label: "Approved",
      value: statuses.approved || 0,
      sub: "verified buyers",
      icon: CheckCircle2,
      tone: "text-emerald-700 bg-emerald-50"
    },
    {
      label: "Needs correction",
      value: statuses.resubmission_required || 0,
      sub: "waiting on buyer",
      icon: RotateCcw,
      tone: "text-orange-700 bg-orange-50"
    },
    {
      label: "Rejected",
      value: statuses.rejected || 0,
      sub: "closed cases",
      icon: XCircle,
      tone: "text-red-700 bg-red-50"
    },
    {
      label: "Emails",
      value: data.emails?.total ?? 0,
      sub: `${data.emails?.failed ?? 0} failed`,
      icon: Mail,
      tone: "text-indigo-700 bg-indigo-50"
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-950">
          Overview
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Live snapshot of the KYC pipeline.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                  {stat.label}
                </p>
                <p className="mt-2 text-3xl font-black tracking-tight text-gray-950">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-400">{stat.sub}</p>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.tone}`}>
                <stat.icon size={18} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-[1.75rem] border border-gray-200/80 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-950">Activity</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Every action across buyers, reviewers, and the system.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenCases}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            View all cases
            <ChevronRight size={14} />
          </button>
        </div>

        <div className="relative mt-6">
          <div className="absolute bottom-2 left-[19px] top-2 w-px bg-gray-200" />

          <div className="space-y-1">
            {(data.recentAudit || []).map((log) => {
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
                        {log.action.replaceAll("_", " ")}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          ACTOR_STYLES[log.actorType] || ACTOR_STYLES.system
                        }`}
                      >
                        {log.actorName || log.actorType}
                      </span>
                    </div>

                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {log.buyerName ? (
                        <>
                          {log.kycId ? (
                            <Link
                              to={`/reviewer/cases/${log.kycId}`}
                              className="font-semibold text-gray-700 hover:text-gray-950 hover:underline"
                            >
                              {log.buyerName}
                            </Link>
                          ) : (
                            <span className="font-semibold text-gray-700">{log.buyerName}</span>
                          )}
                          {log.panMasked ? ` • ${log.panMasked}` : ""}
                        </>
                      ) : (
                        "—"
                      )}
                    </p>

                    {(log.oldStatus || log.newStatus) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {log.oldStatus && <StatusBadge status={log.oldStatus} />}
                        {log.oldStatus && log.newStatus && (
                          <ChevronRight size={12} className="text-gray-300" />
                        )}
                        {log.newStatus && <StatusBadge status={log.newStatus} />}
                      </div>
                    )}
                  </div>

                  <p
                    className="shrink-0 pt-1 text-xs font-medium text-gray-400"
                    title={formatDateTime(log.createdAt)}
                  >
                    {timeAgo(log.createdAt)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

// ============================ KYC cases ============================

const CASE_FILTERS = [
  { label: "All", value: "" },
  { label: "Awaiting review", value: "submitted" },
  { label: "Under review", value: "under_review" },
  { label: "Resubmission", value: "resubmission_required" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "In progress", value: "in_progress" },
  { label: "Link sent", value: "link_sent" }
];

function CasesTab() {
  const [cases, setCases] = useState([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setIsLoading(true);
    getAdminKycCases(status)
      .then((result) => setCases(result.data || []))
      .catch((err) => setError(err.response?.data?.message || "Failed to load."))
      .finally(() => setIsLoading(false));
  }, [status]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return cases;

    return cases.filter(
      (item) =>
        item.buyerName?.toLowerCase().includes(term) ||
        item.buyerEmail?.toLowerCase().includes(term) ||
        item.panMasked?.toLowerCase().includes(term) ||
        item.purchaseId?.toLowerCase().includes(term) ||
        item.reviewers?.some((name) => name.toLowerCase().includes(term))
    );
  }, [cases, search]);

  if (error) return <ErrorNote message={error} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-950">
          KYC cases
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Full pipeline visibility — including who reviewed what.
        </p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {CASE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatus(filter.value)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                status === filter.value
                  ? "bg-gray-950 text-white"
                  : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="relative lg:w-72">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buyer, email, PAN, reviewer…"
            className="w-full rounded-full border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-gray-400"
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingNote />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-200/80 bg-white p-10 text-center text-sm text-gray-500">
          No cases match this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <AdminCaseRow key={item.kycId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function AdminCaseRow({ item }) {
  const progress = item.progress || {};

  return (
    <Link
      to={`/reviewer/cases/${item.kycId}`}
      className="block rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        {/* Buyer */}
        <div className="min-w-0 xl:w-[30%]">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold text-gray-950">{item.buyerName}</p>
            <StatusBadge status={item.overallStatus} />
          </div>
          <p className="mt-1 truncate text-xs text-gray-500">
            {item.panMasked} • {item.entityLabel} • {item.serviceType}
          </p>
          <p className="mt-0.5 truncate text-xs text-gray-400">{item.buyerEmail}</p>
        </div>

        {/* Progress */}
        <div className="flex flex-wrap items-center gap-4 xl:w-[26%]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">
              Documents
            </p>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{
                    width: `${
                      progress.requiredDocs
                        ? Math.round((progress.acceptedDocs / progress.requiredDocs) * 100)
                        : 0
                    }%`
                  }}
                />
              </div>
              <span className="text-xs font-bold text-gray-700">
                {progress.acceptedDocs}/{progress.requiredDocs}
              </span>
              {progress.failedDocs > 0 && (
                <span className="text-[10px] font-bold text-orange-600">
                  {progress.failedDocs} flagged
                </span>
              )}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">
              Video
            </p>
            <div className="mt-1">
              <StatusBadge status={progress.videoStatus} />
            </div>
          </div>
        </div>

        {/* Reviewers */}
        <div className="min-w-0 xl:w-[22%]">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">
            Reviewed by
          </p>
          {item.reviewers?.length ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.reviewers.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700"
                >
                  <UserRound size={10} />
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-gray-400">Not reviewed yet</p>
          )}
        </div>

        {/* Last decision */}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">
            Last decision
          </p>
          {item.lastDecision ? (
            <div className="mt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={item.lastDecision.decision} />
                <span className="text-xs text-gray-500">
                  by <strong className="text-gray-700">{item.lastDecision.byName || "—"}</strong>{" "}
                  • {timeAgo(item.lastDecision.at)}
                </span>
              </div>
              {item.lastDecision.remarks && (
                <p className="mt-1 truncate text-xs italic text-gray-400">
                  “{item.lastDecision.remarks}”
                </p>
              )}
            </div>
          ) : (
            <p className="mt-1 text-xs text-gray-400">No final decision yet</p>
          )}
        </div>

        <ChevronRight size={18} className="hidden shrink-0 text-gray-300 xl:block" />
      </div>
    </Link>
  );
}

// ============================ Document config ============================

function RequirementsTab() {
  const [entityTypes, setEntityTypes] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    getAdminEntityTypes()
      .then((result) => setEntityTypes(result.data || []))
      .catch((err) => setError(err.response?.data?.message || "Failed to load."));
  }, []);

  useEffect(load, [load]);

  async function toggle(requirement, field) {
    const result = await updateAdminRequirement(requirement.id, {
      [field]: !requirement[field]
    });
    if (result.success) {
      setNotice("Saved — changes apply to NEW KYC cases only.");
      load();
    }
  }

  if (error) return <ErrorNote message={error} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-950">
          Document config
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Checklist rules per entity type. In-flight KYCs keep their snapshot.
        </p>
      </div>

      {notice && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
          {notice}
        </div>
      )}

      {entityTypes.map((entity) => (
        <section
          key={entity.id}
          className="rounded-[1.75rem] border border-gray-200/80 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-950">{entity.label}</h2>
              <p className="text-xs text-gray-500">
                key: {entity.key} • PAN char: {entity.panChar || "—"}
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  <th className="py-2 pr-3">Document</th>
                  <th className="py-2 pr-3">Input mode</th>
                  <th className="py-2 pr-3">Required</th>
                  <th className="py-2 pr-3">Active</th>
                  <th className="py-2 pr-3">OCR</th>
                  <th className="py-2">Sort</th>
                </tr>
              </thead>
              <tbody>
                {entity.requirements.map((req) => (
                  <tr
                    key={req.id}
                    className={`border-t border-gray-100 transition ${
                      req.isActive ? "" : "opacity-45"
                    }`}
                  >
                    <td className="py-3 pr-3 font-semibold text-gray-900">
                      {req.documentName}
                      {!req.isActive && (
                        <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500">
                          inactive
                        </span>
                      )}
                      <span className="block text-xs font-normal text-gray-400">
                        {req.documentKey}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-gray-600">{req.inputMode}</td>
                    <td className="py-3 pr-3">
                      {/* Required/OCR only mean something while the document
                          is active — otherwise it never enters a checklist. */}
                      <ToggleButton
                        value={req.isRequired}
                        disabled={!req.isActive}
                        onClick={() => toggle(req, "isRequired")}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <ToggleButton value={req.isActive} onClick={() => toggle(req, "isActive")} />
                    </td>
                    <td className="py-3 pr-3">
                      <ToggleButton
                        value={req.ocrEnabled}
                        disabled={!req.isActive}
                        onClick={() => toggle(req, "ocrEnabled")}
                      />
                    </td>
                    <td className="py-3 text-gray-600">{req.sortOrder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <NewRequirementForm entityTypeId={entity.id} onCreated={load} />
        </section>
      ))}
    </div>
  );
}

function NewRequirementForm({ entityTypeId, onCreated }) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({
    documentKey: "",
    documentName: "",
    inputMode: "upload",
    isRequired: true,
    sortOrder: 99
  });
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      const result = await createAdminRequirement({
        entityTypeId,
        ...form,
        sortOrder: Number(form.sortOrder)
      });

      if (result.success) {
        setIsOpen(false);
        setForm({ documentKey: "", documentName: "", inputMode: "upload", isRequired: true, sortOrder: 99 });
        onCreated();
      } else {
        setError(result.message || JSON.stringify(result.errors));
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create.");
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-4 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      >
        + Add document requirement
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 grid gap-3 rounded-2xl bg-gray-50 p-4 sm:grid-cols-2 lg:grid-cols-5">
      <input
        required
        placeholder="document_key"
        value={form.documentKey}
        onChange={(e) => setForm({ ...form, documentKey: e.target.value })}
        className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
      />
      <input
        required
        placeholder="Document name"
        value={form.documentName}
        onChange={(e) => setForm({ ...form, documentName: e.target.value })}
        className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
      />
      <select
        value={form.inputMode}
        onChange={(e) => setForm({ ...form, inputMode: e.target.value })}
        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
      >
        <option value="upload">upload</option>
        <option value="live_photo_front">live_photo_front</option>
        <option value="live_photo_front_back">live_photo_front_back</option>
        <option value="upload_or_live_photo">upload_or_live_photo</option>
      </select>
      <input
        type="number"
        placeholder="Sort order"
        value={form.sortOrder}
        onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
        className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button type="submit" className="rounded-xl bg-gray-950 px-4 py-2 text-xs font-semibold text-white">
          Create
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600"
        >
          Cancel
        </button>
      </div>
      {error && <p className="col-span-full text-xs font-medium text-red-600">{error}</p>}
    </form>
  );
}

// ============================ Users ============================

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", fullName: "", role: "reviewer", password: "" });
  const [formError, setFormError] = useState("");

  const load = useCallback(() => {
    getAdminUsers()
      .then((result) => setUsers(result.data || []))
      .catch((err) => setError(err.response?.data?.message || "Failed to load."));
  }, []);

  useEffect(load, [load]);

  async function handleCreate(event) {
    event.preventDefault();
    setFormError("");

    try {
      const result = await createAdminUser(form);
      if (result.success) {
        setForm({ email: "", fullName: "", role: "reviewer", password: "" });
        load();
      } else {
        setFormError(result.message || JSON.stringify(result.errors));
      }
    } catch (err) {
      setFormError(err.response?.data?.message || "Failed to create user.");
    }
  }

  async function toggleStatus(user) {
    await updateAdminUser(user.id, {
      status: user.status === "active" ? "disabled" : "active"
    });
    load();
  }

  if (error) return <ErrorNote message={error} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-950">Team</h1>
        <p className="mt-1 text-sm text-gray-500">
          Reviewers and administrators. Disabling a user revokes their sessions.
        </p>
      </div>

      <section className="rounded-[1.75rem] border border-gray-200/80 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-gray-950">Create user</h2>
        <form onSubmit={handleCreate} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            required
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Full name"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="reviewer">reviewer</option>
            <option value="admin">admin</option>
          </select>
          <input
            required
            type="password"
            placeholder="Password (min 10 chars)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-xl bg-gray-950 px-4 py-2 text-xs font-semibold text-white">
            Create user
          </button>
          {formError && (
            <p className="col-span-full text-xs font-medium text-red-600">{formError}</p>
          )}
        </form>
      </section>

      <section className="rounded-[1.75rem] border border-gray-200/80 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-gray-950">Members</h2>
        <div className="mt-4 space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex flex-col gap-2 rounded-xl bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-950 text-xs font-bold text-white">
                  {user.fullName.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    {user.fullName}{" "}
                    <span
                      className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        user.role === "admin"
                          ? "bg-purple-50 text-purple-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {user.role}
                    </span>
                    {user.status === "disabled" && (
                      <span className="ml-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600">
                        disabled
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {user.email} • last login:{" "}
                    {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "never"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleStatus(user)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                  user.status === "active"
                    ? "border border-red-200 bg-white text-red-600 hover:bg-red-50"
                    : "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                {user.status === "active" ? "Disable" : "Enable"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ============================ Settings ============================

function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getAdminSettings()
      .then((result) => setSettings(result.data || result))
      .catch((err) => setError(err.response?.data?.message || "Failed to load."));
  }, []);

  async function handleSave(event) {
    event.preventDefault();
    setNotice("");

    const result = await patchAdminSettings({
      max_reminders: Number(settings.max_reminders),
      reminder_interval_hours: Number(settings.reminder_interval_hours)
    });

    if (result.success) setNotice("Settings saved.");
  }

  if (error) return <ErrorNote message={error} />;
  if (!settings) return <LoadingNote />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-950">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Workflow configuration.</p>
      </div>

      <section className="max-w-lg rounded-[1.75rem] border border-gray-200/80 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-gray-950">Reminders</h2>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
              Max reminders
            </label>
            <input
              type="number"
              min={0}
              max={20}
              value={settings.max_reminders}
              onChange={(e) => setSettings({ ...settings, max_reminders: e.target.value })}
              className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
              Reminder interval (hours)
            </label>
            <input
              type="number"
              min={1}
              max={336}
              value={settings.reminder_interval_hours}
              onChange={(e) =>
                setSettings({ ...settings, reminder_interval_hours: e.target.value })
              }
              className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          {notice && (
            <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
              {notice}
            </p>
          )}

          <button type="submit" className="rounded-xl bg-gray-950 px-5 py-2.5 text-xs font-semibold text-white">
            Save settings
          </button>
        </form>
      </section>
    </div>
  );
}

// ============================ Email logs ============================

function EmailLogsTab() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getAdminEmailLogs({ limit: 100 })
      .then((result) => setLogs(result.data || []))
      .catch((err) => setError(err.response?.data?.message || "Failed to load."));
  }, []);

  if (error) return <ErrorNote message={error} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-950">
          Email logs
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Every notification the system sent (or simulated in dev).
        </p>
      </div>

      <section className="rounded-[1.75rem] border border-gray-200/80 bg-white p-6 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">To</th>
                <th className="py-2 pr-3">Subject</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-gray-100">
                  <td className="py-3 pr-3 font-semibold capitalize text-gray-900">
                    {log.emailType.replaceAll("_", " ")}
                  </td>
                  <td className="py-3 pr-3 text-gray-600">
                    {log.recipient || log.recipientMasked}
                  </td>
                  <td className="max-w-[260px] truncate py-3 pr-3 text-gray-600">
                    {log.subject}
                  </td>
                  <td className="py-3 pr-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        log.status === "sent"
                          ? "bg-emerald-50 text-emerald-700"
                          : log.status === "failed"
                            ? "bg-red-50 text-red-700"
                            : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="py-3 text-xs text-gray-400">{formatDateTime(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ============================ shared ============================

function ToggleButton({ value, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Activate the document first" : undefined}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
        disabled
          ? "cursor-not-allowed bg-gray-100"
          : value
            ? "bg-emerald-500"
            : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          value && !disabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function LoadingNote() {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-10 text-center text-sm text-gray-500">
      Loading…
    </div>
  );
}

function ErrorNote({ message }) {
  return (
    <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
      {message}
    </div>
  );
}
