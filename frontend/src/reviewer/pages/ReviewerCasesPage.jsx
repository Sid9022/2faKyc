import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  FileSearch,
  Loader2,
  LogOut,
  RefreshCcw,
  Search
} from "lucide-react";
import { getCurrentUser, getReviewerCases, logout } from "../../api/kycApi";
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
      setError(
        err?.response?.data?.message || "Unable to load reviewer cases."
      );
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

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <header className="rounded-[2rem] border border-white/80 bg-white/80 p-6 shadow-sm backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-950 text-white">
                <FileSearch size={22} />
              </div>

              <h1 className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-gray-950 sm:text-4xl">
                Reviewer Dashboard
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
                Review submitted KYC cases, verify documents and video
                declaration, then apply final decision.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-600">
                {getCurrentUser()?.fullName} ({getCurrentUser()?.role})
              </span>

              {getCurrentUser()?.role === "admin" && (
                <a
                  href="/admin"
                  className="rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Admin
                </a>
              )}

              <button
                type="button"
                onClick={() => loadCases(status)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                <RefreshCcw size={16} />
                Refresh
              </button>

              <button
                type="button"
                onClick={async () => {
                  await logout();
                  window.location.href = "/login";
                }}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </div>
        </header>

        <section className="mt-6 rounded-[2rem] border border-gray-200/80 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {filters.map((item) => (
                <button
                  key={item.value || "all"}
                  type="button"
                  onClick={() => setStatus(item.value)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    status === item.value
                      ? "bg-gray-950 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="relative w-full lg:w-80">
              <Search
                size={17}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name/email/purchase — or type full PAN"
                className="w-full rounded-full border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-gray-400 focus:bg-white"
              />
            </div>
          </div>
        </section>

        {isLoading && (
          <div className="mt-8 rounded-[2rem] bg-white p-8 text-gray-600 shadow-sm">
            <div className="flex items-center gap-3">
              <Loader2 className="animate-spin" size={20} />
              Loading reviewer cases...
            </div>
          </div>
        )}

        {error && (
          <div className="mt-8 rounded-[2rem] border border-red-100 bg-red-50 p-6 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {!isLoading && !error && (
          <div className="mt-6 grid gap-4">
            {filteredCases.length === 0 && (
              <div className="rounded-[2rem] border border-gray-200 bg-white p-8 text-center shadow-sm">
                <p className="text-sm font-semibold text-gray-950">
                  No cases found.
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Try another status filter or refresh.
                </p>
              </div>
            )}

            {filteredCases.map((item) => (
              <CaseRow key={item.kycId} item={item} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function CaseRow({ item }) {
  return (
    <div className="rounded-[2rem] border border-gray-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
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

          <h2 className="mt-3 text-lg font-semibold text-gray-950">
            {item.buyerName}
          </h2>

          <p className="mt-1 text-sm text-gray-500">
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

        <Link
          to={`/reviewer/cases/${item.kycId}`}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-gray-300 transition hover:-translate-y-0.5 hover:bg-black"
        >
          Open review
          <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

function MiniInfo({ label, value }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-gray-950">
        {value || "—"}
      </p>
    </div>
  );
}
