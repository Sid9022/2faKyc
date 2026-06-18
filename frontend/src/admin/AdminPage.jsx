import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
  Mail,
  RotateCcw,
  Search,
  Settings,
  TrendingUp,
  Users,
  UserRound,
  Video,
  XCircle
} from "lucide-react";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
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
  patchAdminSettings,
  updateAdminRequirement,
  updateAdminUser
} from "../api/kycApi";
import StaffLayout from "../components/layout/StaffLayout";
import StatCard from "../components/ui/StatCard";
import SectionCard from "../components/ui/SectionCard";
import DataTable from "../components/ui/DataTable";
import { statusClasses, formatStatusLabel } from "../components/statusStyles";

const NAV = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "cases", label: "KYC cases", icon: FileSearch },
  { key: "requirements", label: "Document config", icon: FileCog },
  { key: "users", label: "Team", icon: Users },
  { key: "settings", label: "Settings", icon: Settings },
  { key: "emails", label: "Email logs", icon: Mail }
];

function StatusBadge({ status, label }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ring-1 ring-inset ${statusClasses(
        status
      )}`}
    >
      {label ? String(label).replaceAll("_", " ") : formatStatusLabel(status)}
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

function formatDate(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}

const TAB_META = {
  cases: {
    title: "KYC cases",
    subtitle: "Full pipeline visibility — including who reviewed what."
  },
  requirements: {
    title: "Document config",
    subtitle: "Checklist rules per entity type. In-flight KYCs keep their snapshot."
  },
  users: {
    title: "Team",
    subtitle: "Reviewers and administrators. Disabling a user revokes their sessions."
  },
  settings: { title: "Settings", subtitle: "Workflow configuration." },
  emails: {
    title: "Email logs",
    subtitle: "Every notification the system sent (or simulated in dev)."
  }
};

export default function AdminPage() {
  const [tab, setTab] = useState("overview");
  const user = getCurrentUser();
  const firstName = (user?.fullName || "").split(" ")[0] || "there";

  const navItems = [
    ...NAV.map((item) => ({ key: item.key, label: item.label, icon: item.icon })),
    {
      key: "reviewer",
      label: "Reviewer console",
      icon: BadgeCheck,
      to: "/reviewer/cases",
      trailing: <ArrowUpRight size={14} className="text-white/40" />
    }
  ];

  const meta =
    tab === "overview"
      ? {
          title: `Welcome back, ${firstName}`,
          subtitle: "Here's what's happening with your KYC pipeline today"
        }
      : TAB_META[tab];

  return (
    <StaffLayout
      title={meta?.title}
      subtitle={meta?.subtitle}
      active={tab}
      navItems={navItems}
      onNavItem={setTab}
    >
      {tab === "overview" && <OverviewTab onOpenCases={() => setTab("cases")} />}
      {tab === "cases" && <CasesTab />}
      {tab === "requirements" && <RequirementsTab />}
      {tab === "users" && <UsersTab />}
      {tab === "settings" && <SettingsTab />}
      {tab === "emails" && <EmailLogsTab />}
    </StaffLayout>
  );
}

// ============================ Overview ============================

const ACTION_ICONS = [
  { match: /approved|accepted/, icon: CheckCircle2, color: "text-green-600 bg-green-50" },
  { match: /rejected/, icon: XCircle, color: "text-red-600 bg-red-50" },
  { match: /resubmi/, icon: RotateCcw, color: "text-violet-600 bg-violet-50" },
  { match: /video/, icon: Video, color: "text-violet-600 bg-violet-50" },
  { match: /email|reminder/, icon: Mail, color: "text-blue-600 bg-blue-50" },
  { match: /login/, icon: UserRound, color: "text-slate-600 bg-slate-100" },
  { match: /auto_check/, icon: Bot, color: "text-indigo-600 bg-indigo-50" }
];

function actionVisual(action = "") {
  const found = ACTION_ICONS.find((item) => item.match.test(action));
  return found || { icon: Activity, color: "text-slate-600 bg-slate-100" };
}

const ACTOR_STYLES = {
  reviewer: "bg-amber-50 text-amber-700",
  admin: "bg-violet-50 text-violet-700",
  buyer: "bg-blue-50 text-blue-700",
  system: "bg-slate-100 text-slate-500"
};

const WEEKLY_CHART_COLORS = {
  submitted: "#3B82F6",
  approved: "#22C55E",
  rejected: "#EF4444"
};

const WORKLOAD_BAR_COLORS = ["#6366F1", "#3B82F6", "#22C55E", "#F59E0B", "#8B5CF6", "#EF4444", "#EC4899", "#14B8A6"];

function WeeklyChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl">
      <p className="mb-2 text-sm font-bold text-navy">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="capitalize text-slate-600">{entry.dataKey}</span>
          <span className="ml-auto font-bold text-navy">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function OverviewTab({ onOpenCases }) {
  const [data, setData] = useState(null);
  const [cases, setCases] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getAdminDashboard(), getAdminKycCases("")])
      .then(([dashboard, caseList]) => {
        setData(dashboard.data || dashboard);
        setCases(caseList.data || []);
      })
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
      tone: "navy"
    },
    {
      label: "Awaiting review",
      value: awaiting,
      sub: "submitted + under review",
      icon: Inbox,
      tone: "blue"
    },
    {
      label: "Approved",
      value: statuses.approved || 0,
      sub: "verified buyers",
      icon: CheckCircle2,
      tone: "green"
    },
    {
      label: "Needs correction",
      value: statuses.resubmission_required || 0,
      sub: "waiting on buyer",
      icon: RotateCcw,
      tone: "purple"
    },
    {
      label: "Rejected",
      value: statuses.rejected || 0,
      sub: "closed cases",
      icon: XCircle,
      tone: "red"
    },
    {
      label: "Emails",
      value: data.emails?.total ?? 0,
      sub: `${data.emails?.failed ?? 0} failed`,
      icon: Mail,
      tone: "indigo"
    }
  ];

  const weeklyData = (data.weeklyReview || []).map((bucket) => ({
    name: `${bucket.day}, ${bucket.date.slice(5)}`,
    submitted: bucket.submitted,
    approved: bucket.approved,
    rejected: bucket.rejected
  }));

  const reviewerWorkload = data.reviewerWorkload || [];
  const maxWorkload = Math.max(1, ...reviewerWorkload.map((r) => r.count));

  const recent = cases.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            icon={stat.icon}
            value={stat.value}
            label={stat.label}
            sub={stat.sub}
            tone={stat.tone}
          />
        ))}
      </div>

      {/* Weekly chart + reviewer workload */}
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="KYC submissions — last 7 days"
          subtitle="Daily breakdown of submissions, approvals, and rejections"
        >
          {weeklyData.length === 0 ? (
            <div
              className="flex items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400"
              style={{ height: 280 }}
            >
              No data yet
            </div>
          ) : (
            <div className="-ml-2" style={{ width: "calc(100% + 8px)" }}>
              <ResponsiveContainer width="100%" height={280}>
                <RechartsBarChart
                  data={weeklyData}
                  margin={{ top: 8, right: 8, bottom: 4, left: -12 }}
                  barCategoryGap="22%"
                  barGap={3}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: "#64748b", fontWeight: 500 }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                    dy={6}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip content={<WeeklyChartTooltip />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingTop: 12 }}
                    formatter={(value) => (
                      <span className="capitalize text-slate-600">{value}</span>
                    )}
                  />
                  <Bar dataKey="submitted" name="Submitted" fill={WEEKLY_CHART_COLORS.submitted} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="approved" name="Approved" fill={WEEKLY_CHART_COLORS.approved} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="rejected" name="Rejected" fill={WEEKLY_CHART_COLORS.rejected} radius={[4, 4, 0, 0]} />
                </RechartsBarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Reviewer activity"
          subtitle="Cases each reviewer has acted on (not assignment)"
        >
          {reviewerWorkload.length === 0 ? (
            <p className="text-sm text-slate-400">No active reviewers.</p>
          ) : (
            <div className="space-y-4">
              {reviewerWorkload.map((row, index) => (
                <div key={row.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-navy">{row.name}</span>
                    <span className="text-slate-400">{row.count} cases</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.round((row.count / maxWorkload) * 100)}%`,
                        backgroundColor:
                          WORKLOAD_BAR_COLORS[index % WORKLOAD_BAR_COLORS.length]
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Recent applications */}
      <SectionCard
        title="Recent KYC applications"
        subtitle="Latest cases across all statuses"
        actions={
          <button
            type="button"
            onClick={onOpenCases}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View all
            <ChevronRight size={14} />
          </button>
        }
      >
        <DataTable
          columns={[
            { key: "name", header: "Name" },
            { key: "pan", header: "PAN" },
            { key: "entity", header: "Entity" },
            { key: "status", header: "Status" },
            { key: "submitted", header: "Submitted" },
            { key: "action", header: "Action", align: "right" }
          ]}
          rows={recent}
          emptyMessage="No KYC applications yet."
          renderCell={(row, key) => {
            if (key === "name") {
              return (
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy">{row.buyerName}</p>
                  <p className="truncate text-xs text-slate-400">
                    {row.purchaseId}
                  </p>
                </div>
              );
            }
            if (key === "pan") {
              return <span className="font-mono text-xs text-slate-600">{row.panMasked}</span>;
            }
            if (key === "entity") {
              return (
                <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                  {row.entityLabel}
                </span>
              );
            }
            if (key === "status") return <StatusBadge status={row.overallStatus} />;
            if (key === "submitted") {
              return <span className="text-xs text-slate-500">{formatDate(row.createdAt)}</span>;
            }
            return (
              <Link
                to={`/reviewer/cases/${row.kycId}`}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-navy transition hover:bg-slate-50"
              >
                Review <ChevronRight size={13} />
              </Link>
            );
          }}
        />
      </SectionCard>

      {/* Recent activity feed (audit) */}
      <SectionCard
        title="Recent activity"
        subtitle="Every action across buyers, reviewers, and the system"
      >
        <div className="relative">
          <div className="absolute bottom-2 left-[19px] top-2 w-px bg-slate-200" />
          <div className="space-y-1">
            {(data.recentAudit || []).map((log) => {
              const visual = actionVisual(log.action);
              return (
                <div
                  key={log.id}
                  className="relative flex gap-4 rounded-2xl p-2.5 transition hover:bg-slate-50"
                >
                  <div
                    className={`relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${visual.color}`}
                  >
                    <visual.icon size={16} />
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-bold capitalize text-navy">
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
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {log.buyerName ? (
                        <>
                          {log.kycId ? (
                            <Link
                              to={`/reviewer/cases/${log.kycId}`}
                              className="font-semibold text-slate-700 hover:text-navy hover:underline"
                            >
                              {log.buyerName}
                            </Link>
                          ) : (
                            <span className="font-semibold text-slate-700">{log.buyerName}</span>
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
                          <ChevronRight size={12} className="text-slate-300" />
                        )}
                        {log.newStatus && <StatusBadge status={log.newStatus} />}
                      </div>
                    )}
                  </div>
                  <p
                    className="shrink-0 pt-1 text-xs font-medium text-slate-400"
                    title={formatDateTime(log.createdAt)}
                  >
                    {timeAgo(log.createdAt)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </SectionCard>
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
        item.pan?.toLowerCase().includes(term) ||
        item.panMasked?.toLowerCase().includes(term) ||
        item.purchaseId?.toLowerCase().includes(term) ||
        item.reviewers?.some((name) => name.toLowerCase().includes(term))
    );
  }, [cases, search]);

  if (error) return <ErrorNote message={error} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {CASE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatus(filter.value)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                status === filter.value
                  ? "bg-navy text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="relative lg:w-72">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buyer, email, PAN, reviewer…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingNote />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
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
      className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <div className="min-w-0 xl:w-[30%]">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold text-navy">{item.buyerName}</p>
            <StatusBadge status={item.overallStatus} />
          </div>
          <p className="mt-1 truncate text-xs text-slate-500">
            {item.pan || item.panMasked} • {item.entityLabel} • {item.serviceType}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-400">{item.buyerEmail}</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 xl:w-[26%]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Documents
            </p>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{
                    width: `${
                      progress.requiredDocs
                        ? Math.round((progress.acceptedDocs / progress.requiredDocs) * 100)
                        : 0
                    }%`
                  }}
                />
              </div>
              <span className="text-xs font-bold text-slate-700">
                {progress.acceptedDocs}/{progress.requiredDocs}
              </span>
              {progress.failedDocs > 0 && (
                <span className="text-[10px] font-bold text-violet-600">
                  {progress.failedDocs} flagged
                </span>
              )}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Video
            </p>
            <div className="mt-1">
              <StatusBadge status={progress.videoStatus} />
            </div>
          </div>
        </div>

        <div className="min-w-0 xl:w-[22%]">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
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
            <p className="mt-1 text-xs text-slate-400">Not reviewed yet</p>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Last decision
          </p>
          {item.lastDecision ? (
            <div className="mt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={item.lastDecision.decision} />
                <span className="text-xs text-slate-500">
                  by <strong className="text-slate-700">{item.lastDecision.byName || "—"}</strong>{" "}
                  • {timeAgo(item.lastDecision.at)}
                </span>
              </div>
              {item.lastDecision.remarks && (
                <p className="mt-1 truncate text-xs italic text-slate-400">
                  “{item.lastDecision.remarks}”
                </p>
              )}
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-400">No final decision yet</p>
          )}
        </div>

        <ChevronRight size={18} className="hidden shrink-0 text-slate-300 xl:block" />
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
      {notice && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
          {notice}
        </div>
      )}

      {entityTypes.map((entity) => (
        <SectionCard
          key={entity.id}
          title={entity.label}
          subtitle={`key: ${entity.key} • PAN char: ${entity.panChar || "—"}`}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
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
                    className={`border-t border-slate-100 transition ${
                      req.isActive ? "" : "opacity-45"
                    }`}
                  >
                    <td className="py-3 pr-3 font-semibold text-slate-900">
                      {req.documentName}
                      {!req.isActive && (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                          inactive
                        </span>
                      )}
                      <span className="block text-xs font-normal text-slate-400">
                        {req.documentKey}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-slate-600">{req.inputMode}</td>
                    <td className="py-3 pr-3">
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
                    <td className="py-3 text-slate-600">{req.sortOrder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <NewRequirementForm entityTypeId={entity.id} onCreated={load} />
        </SectionCard>
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
        className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        + Add document requirement
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-5">
      <input
        required
        placeholder="document_key"
        value={form.documentKey}
        onChange={(e) => setForm({ ...form, documentKey: e.target.value })}
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
      />
      <input
        required
        placeholder="Document name"
        value={form.documentName}
        onChange={(e) => setForm({ ...form, documentName: e.target.value })}
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
      />
      <select
        value={form.inputMode}
        onChange={(e) => setForm({ ...form, inputMode: e.target.value })}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
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
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button type="submit" className="rounded-xl bg-navy px-4 py-2 text-xs font-semibold text-white">
          Create
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600"
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
      <SectionCard title="Create user">
        <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            required
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Full name"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
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
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-xl bg-navy px-4 py-2 text-xs font-semibold text-white">
            Create user
          </button>
          {formError && (
            <p className="col-span-full text-xs font-medium text-red-600">{formError}</p>
          )}
        </form>
      </SectionCard>

      <SectionCard title="Members">
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex flex-col gap-2 rounded-xl bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
                  {user.fullName.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {user.fullName}{" "}
                    <span
                      className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        user.role === "admin"
                          ? "bg-violet-50 text-violet-700"
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
                  <p className="text-xs text-slate-500">
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
                    : "border border-green-200 bg-white text-green-700 hover:bg-green-50"
                }`}
              >
                {user.status === "active" ? "Disable" : "Enable"}
              </button>
            </div>
          ))}
        </div>
      </SectionCard>
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
    <SectionCard className="max-w-lg" title="Reminders">
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Max reminders
          </label>
          <input
            type="number"
            min={0}
            max={20}
            value={settings.max_reminders}
            onChange={(e) => setSettings({ ...settings, max_reminders: e.target.value })}
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
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
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        {notice && (
          <p className="rounded-xl border border-green-100 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700">
            {notice}
          </p>
        )}

        <button type="submit" className="rounded-xl bg-navy px-5 py-2.5 text-xs font-semibold text-white">
          Save settings
        </button>
      </form>
    </SectionCard>
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
    <SectionCard>
      <DataTable
        minWidth={680}
        columns={[
          { key: "type", header: "Type" },
          { key: "to", header: "To" },
          { key: "subject", header: "Subject" },
          { key: "status", header: "Status" },
          { key: "when", header: "When" }
        ]}
        rows={logs}
        emptyMessage="No emails yet."
        renderCell={(log, key) => {
          if (key === "type") {
            return (
              <span className="font-semibold capitalize text-slate-900">
                {log.emailType.replaceAll("_", " ")}
              </span>
            );
          }
          if (key === "to") {
            return <span className="text-slate-600">{log.recipient || log.recipientMasked}</span>;
          }
          if (key === "subject") {
            return (
              <span className="block max-w-[260px] truncate text-slate-600">{log.subject}</span>
            );
          }
          if (key === "status") {
            return (
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                  log.status === "sent"
                    ? "bg-green-50 text-green-700"
                    : log.status === "failed"
                      ? "bg-red-50 text-red-700"
                      : "bg-slate-100 text-slate-600"
                }`}
              >
                {log.status}
              </span>
            );
          }
          return <span className="text-xs text-slate-400">{formatDateTime(log.createdAt)}</span>;
        }}
      />
    </SectionCard>
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
        disabled ? "cursor-not-allowed bg-slate-100" : value ? "bg-success" : "bg-slate-200"
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
    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
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
