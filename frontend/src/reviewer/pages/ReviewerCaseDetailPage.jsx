import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  FileSearch,
  FileText,
  History,
  LayoutDashboard,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Video
} from "lucide-react";

import { getCurrentUser, getReviewerCaseDetail } from "../../api/kycApi";
import StaffLayout from "../../components/layout/StaffLayout";
import AuditTimeline from "../components/AuditTimeline";
import DocumentReviewCard from "../components/DocumentReviewCard";
import FinalDecisionPanel from "../components/FinalDecisionPanel";
import ReviewerBadge from "../components/ReviewerBadge";
import VideoReviewCard from "../components/VideoReviewCard";

const tabs = [
  { key: "overview", label: "Overview", icon: Building2 },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "video", label: "Video", icon: Video },
  { key: "audit", label: "Audit", icon: History }
];

function buildNavItems() {
  const isAdmin = getCurrentUser()?.role === "admin";
  return [
    { key: "cases", label: "KYC cases", icon: FileSearch, to: "/reviewer/cases" },
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
}

export default function ReviewerCaseDetailPage() {
  const { kycId } = useParams();
  const scrollPositionRef = useRef(0);

  const [detail, setDetail] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDetail(options = {}) {
    const { silent = false, preserveScroll = false } = options;

    try {
      if (preserveScroll) {
        scrollPositionRef.current = window.scrollY;
      }

      if (!silent) {
        setIsLoading(true);
      }

      setError("");

      const result = await getReviewerCaseDetail(kycId);

      if (!result.success) {
        setError(result.message || "Unable to load KYC case.");
        return;
      }

      setDetail(result);

      if (preserveScroll) {
        requestAnimationFrame(() => {
          window.scrollTo({
            top: scrollPositionRef.current,
            behavior: "instant"
          });
        });
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to load KYC case detail.");
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }

  async function refreshCaseSilently() {
    await loadDetail({
      silent: true,
      preserveScroll: true
    });
  }

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kycId]);

  const navItems = buildNavItems();

  if (isLoading) {
    return (
      <StaffLayout title="KYC case" active="cases" navItems={navItems}>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="animate-spin" size={20} />
            Loading KYC review case...
          </div>
        </div>
      </StaffLayout>
    );
  }

  if (error || !detail) {
    return (
      <StaffLayout title="KYC case" active="cases" navItems={navItems}>
        <div className="rounded-2xl border border-red-100 bg-red-50 p-8">
          <p className="text-sm font-semibold text-red-700">
            {error || "Case not found."}
          </p>
          <Link
            to="/reviewer/cases"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-white"
          >
            <ArrowLeft size={16} />
            Back to cases
          </Link>
        </div>
      </StaffLayout>
    );
  }

  const kyc = detail.case;

  return (
    <StaffLayout
      title={kyc.buyerName}
      subtitle={`${kyc.entityLabel} • ${kyc.serviceType} • ${kyc.pan || kyc.panMasked}`}
      active="cases"
      navItems={navItems}
      actions={
        <button
          type="button"
          onClick={loadDetail}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <RefreshCcw size={15} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          to="/reviewer/cases"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-navy"
        >
          <ArrowLeft size={16} />
          Back to cases
        </Link>
        <span className="text-slate-300">•</span>
        <ReviewerBadge status={kyc.overallStatus} />
        <ReviewerBadge status="default" label={kyc.currentStage} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  active ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-6">
        {activeTab === "overview" && <OverviewTab detail={detail} reload={loadDetail} />}

        {activeTab === "documents" && (
          <div className="space-y-5">
            {detail.documents.map((document) => (
              <DocumentReviewCard
                key={document.id}
                document={document}
                caseStatus={kyc.overallStatus}
                onReviewed={refreshCaseSilently}
              />
            ))}
          </div>
        )}

        {activeTab === "video" && (
          <VideoReviewCard
            videoDeclaration={detail.videoDeclaration}
            caseStatus={kyc.overallStatus}
            onReviewed={refreshCaseSilently}
          />
        )}

        {activeTab === "audit" && <AuditTimeline logs={detail.auditLogs || []} />}
      </div>
    </StaffLayout>
  );
}

function OverviewTab({ detail, reload }) {
  const kyc = detail.case;

  const requiredDocs = detail.documents.filter((doc) => doc.isRequired);
  const acceptedDocs = requiredDocs.filter((doc) => doc.status === "accepted");
  const failedDocs = detail.documents.filter((doc) =>
    ["rejected", "resubmission_required"].includes(doc.status)
  );

  const videoStatus = detail.videoDeclaration?.status || "not_started";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-700">
            <ShieldCheck size={20} />
          </div>

          <div>
            <h2 className="text-base font-semibold text-navy">KYC summary</h2>
            <p className="mt-1 text-sm text-slate-500">
              Buyer and verification overview
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Info label="Purchase ID" value={kyc.purchaseId} />
          <Info label="Buyer Email" value={kyc.buyerEmail} />
          <Info label="Entity" value={kyc.entityLabel} />
          <Info label="Service" value={kyc.serviceType} />
          <Info label="PAN" value={kyc.pan || kyc.panMasked} />
          <Info label="Mobile" value={kyc.buyerMobile || "—"} />
        </div>

        <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Consent
          </p>

          {detail.consent ? (
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Accepted {detail.consent.consentVersion} in{" "}
              {detail.consent.language?.toUpperCase()} at{" "}
              {formatDateTime(detail.consent.acceptedAt)}
            </p>
          ) : (
            <p className="mt-2 text-sm text-red-600">Consent not found.</p>
          )}
        </div>
      </section>

      <aside className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-navy">Review progress</h2>

          <div className="mt-5 grid gap-3">
            <ProgressRow
              label="Required documents accepted"
              value={`${acceptedDocs.length}/${requiredDocs.length}`}
              ok={acceptedDocs.length === requiredDocs.length}
            />

            <ProgressRow
              label="Failed items"
              value={failedDocs.length}
              ok={failedDocs.length === 0}
            />

            <ProgressRow
              label="Video status"
              value={videoStatus.replaceAll("_", " ")}
              ok={videoStatus === "accepted"}
            />
          </div>
        </section>

        <AutoChecksPanel checks={detail.autoChecks || []} />

        <FinalDecisionPanel
          kycId={kyc.kycId}
          caseStatus={kyc.overallStatus}
          readiness={{
            acceptedRequiredDocs: acceptedDocs.length,
            totalRequiredDocs: requiredDocs.length,
            failedItemsCount:
              failedDocs.length + (videoStatus === "resubmission_required" ? 1 : 0),
            videoAccepted: videoStatus === "accepted"
          }}
          onDecision={reload}
        />
      </aside>
    </div>
  );
}

function AutoChecksPanel({ checks }) {
  if (!checks.length) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-navy">Automated checks</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Advisory only — final decisions are always manual.
      </p>

      <div className="mt-4 space-y-2">
        {checks.map((check) => (
          <div key={check.id} className="rounded-2xl bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold capitalize text-slate-800">
                {check.checkKey.replaceAll("_", " ")}
                {typeof check.score === "number" ? ` (${check.score}%)` : ""}
              </p>
              <ReviewerBadge
                status={check.passed ? "accepted" : "resubmission_required"}
                label={check.passed ? "Pass" : "Flag"}
              />
            </div>

            {check.details?.message && (
              <p className="mt-1.5 text-xs leading-5 text-slate-500">
                {check.details.message}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-semibold text-navy">{value || "—"}</p>
    </div>
  );
}

function ProgressRow({ label, value, ok }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <ReviewerBadge status={ok ? "accepted" : "under_review"} label={value} />
    </div>
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
