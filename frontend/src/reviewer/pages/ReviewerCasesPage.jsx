import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  FileSearch,
  LayoutDashboard,
  Loader2,
  PlusCircle,
  RefreshCcw,
  Search
} from "lucide-react";
import { getCurrentUser, getReviewerCases } from "../../api/kycApi";
import StaffLayout from "../../components/layout/StaffLayout";
import ReviewerBadge from "../components/ReviewerBadge";

const filters = [
  { label: "All", value: "" },
  { label: "Submitted", value: "submitted" },
  { label: "Under Review", value: "under_review" },
  { label: "Resubmission", value: "resubmission_required" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" }
];

const PAN_REGEX = /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/;

export default function ReviewerCasesPage() {
  const [cases, setCases] = useState([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const isAdmin = getCurrentUser()?.role === "admin";

  // Full PANs are never stored or listed, so a complete PAN typed in the
  // search box triggers an exact server-side hash lookup instead.
  const panSearch = PAN_REGEX.test(search.trim()) ? search.trim() : "";

  async function loadCases(nextStatus = status, pan = panSearch) {
    try {
      setIsLoading(true);
      setError("");

      const result = await getReviewerCases(nextStatus, pan);

      if (!result.success) {
        setError(result.message || "Unable to load cases.");
        return;
      }

      setCases(result.cases || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to load reviewer cases.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCases(status, panSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, panSearch]);

  const filteredCases = cases.filter((item) => {
    const term = search.trim().toLowerCase();

    if (!term) return true;

    // Server already did an exact hash lookup for a full PAN.
    if (panSearch) return true;

    return (
      item.buyerName?.toLowerCase().includes(term) ||
      item.buyerEmail?.toLowerCase().includes(term) ||
      item.pan?.toLowerCase().includes(term) ||
      item.panMasked?.toLowerCase().includes(term) ||
      item.purchaseId?.toLowerCase().includes(term)
    );
  });

  const navItems = [
    { key: "cases", label: "KYC cases", icon: FileSearch, to: "/reviewer/cases" },
    {
      key: "new-kyc",
      label: "New KYC",
      icon: PlusCircle,
      to: "/new-kyc"
    },
    ...(isAdmin
      ? [
          {
            key: "admin",
            label: "Admin console",
            icon: LayoutDashboard,
            to: "/admin",
            trailing: <ArrowUpRight size={14} className="text-white/40" />
          }
        ]
      : [])
  ];

  return (
    <StaffLayout
      title="Reviewer dashboard"
      subtitle="Review submitted KYC cases, verify documents and the video declaration, then apply a final decision."
      active="cases"
      navItems={navItems}
      actions={
        <button
          type="button"
          onClick={() => loadCases(status)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <RefreshCcw size={15} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      }
    >
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <button
                key={item.value || "all"}
                type="button"
                onClick={() => setStatus(item.value)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  status === item.value
                    ? "bg-navy text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-80">
            <Search
              size={17}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name/email/purchase — or type full PAN"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/30"
            />
          </div>
        </div>
      </section>

      {isLoading && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-slate-600 shadow-sm">
          <div className="flex items-center gap-3">
            <Loader2 className="animate-spin" size={20} />
            Loading reviewer cases...
          </div>
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-6 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {!isLoading && !error && (
        <div className="mt-6 grid gap-4">
          {filteredCases.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <p className="text-sm font-semibold text-navy">No cases found.</p>
              <p className="mt-1 text-sm text-slate-500">
                Try another status filter or refresh.
              </p>
            </div>
          )}

          {filteredCases.map((item) => (
            <CaseRow key={item.kycId} item={item} />
          ))}
        </div>
      )}
    </StaffLayout>
  );
}

function CaseRow({ item }) {
  return (
    <Link
      to={`/reviewer/cases/${item.kycId}`}
      className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ReviewerBadge status={item.overallStatus} />
            <ReviewerBadge
              status={item.videoSummary?.faceCheckPassed ? "accepted" : "draft_saved"}
              label={
                item.videoSummary?.faceCheckPassed
                  ? "Face check passed"
                  : "Face check pending"
              }
            />
          </div>

          <h2 className="mt-3 text-lg font-semibold text-navy">{item.buyerName}</h2>

          <p className="mt-1 text-sm text-slate-500">
            {item.entityLabel} • {item.serviceType} • {item.pan || item.panMasked}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MiniInfo
              label="Required docs"
              value={`${item.documentSummary?.acceptedRequired || 0}/${
                item.documentSummary?.required || 0
              } accepted`}
            />
            <MiniInfo
              label="Video"
              value={item.videoSummary?.status?.replaceAll("_", " ")}
            />
            <MiniInfo label="Purchase" value={item.purchaseId} />
          </div>
        </div>

        <div className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-navy/90">
          Open review
          <ArrowRight size={16} />
        </div>
      </div>
    </Link>
  );
}

function MiniInfo({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-navy">{value || "—"}</p>
    </div>
  );
}
