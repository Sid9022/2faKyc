import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Video
} from "lucide-react";

import { API_BASE_URL, getKycResubmissionWorkspace } from "../api/kycApi";
import StatusPill from "./StatusPill";

export default function ResubmissionPortal({
  token,
  language = "en",
  onCorrectDocuments,
  onCorrectVideo,
  onBack
}) {
  const [workspace, setWorkspace] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadWorkspace() {
    try {
      setIsLoading(true);
      setError("");

      const result = await getKycResubmissionWorkspace(token);

      if (!result.success) {
        setError(result.message || "Unable to load correction workspace.");
        return;
      }

      setWorkspace(result);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Unable to load correction workspace. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-white/80 bg-white/90 p-8 shadow-xl shadow-gray-200/70">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="animate-spin" size={20} />
          Loading correction details...
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-100 bg-white/90 p-8 shadow-xl shadow-red-100/60">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <AlertCircle size={26} />
        </div>

        <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em] text-navy">
          Unable to load correction request
        </h1>

        <p className="mt-3 text-sm leading-7 text-red-600">{error}</p>

        <button
          type="button"
          onClick={onBack}
          className="mt-8 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700"
        >
          <ArrowLeft size={16} />
          Back
        </button>
      </section>
    );
  }

  const isApproved = workspace?.kyc?.overallStatus === "approved";
  const isRejected = workspace?.kyc?.overallStatus === "rejected";
  const isWaitingForReview = workspace?.nextAction === "waiting_for_review";
  const needsDocuments = workspace?.nextAction === "resubmit_documents";
  const needsVideo = workspace?.nextAction === "resubmit_video";

  if (isApproved) {
    return (
      <FinalState
        type="approved"
        title="KYC approved"
        description="Your KYC has been verified and approved."
        onBack={onBack}
      />
    );
  }

  if (isRejected) {
    return (
      <FinalState
        type="rejected"
        title="KYC rejected"
        description="Your KYC has been rejected. Please contact support for more information."
        onBack={onBack}
      />
    );
  }

  if (isWaitingForReview) {
    return (
      <FinalState
        type="waiting"
        title="Corrections submitted"
        description="Your corrected items are submitted for reviewer verification. We will notify you if more action is required."
        onBack={onBack}
      />
    );
  }

  return (
    <section className="rounded-2xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status="pending" label="Correction required" />
        <StatusPill
          status="active"
          label={workspace?.kyc?.entityLabel || "KYC"}
        />
      </div>

      <div className="mt-7 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">
            Your KYC needs a small correction.
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
            Only the failed item is reopened. Accepted documents and accepted
            video declarations are locked, so you do not need to upload
            everything again.
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <SummaryTile
              label="Accepted documents"
              value={workspace?.summary?.acceptedDocumentsCount || 0}
              tone="success"
            />

            <SummaryTile
              label="Documents to correct"
              value={workspace?.summary?.documentsNeedingResubmissionCount || 0}
              tone={needsDocuments ? "warning" : "neutral"}
            />

            <SummaryTile
              label="Video correction"
              value={workspace?.summary?.videoNeedsResubmission ? "Yes" : "No"}
              tone={needsVideo ? "warning" : "success"}
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            KYC summary
          </p>

          <div className="mt-4 space-y-3">
            <Info label="Name / Business" value={workspace?.kyc?.buyerName} />
            <Info label="PAN" value={workspace?.kyc?.panMasked} />
            <Info label="Service" value={workspace?.kyc?.serviceType} />
            <Info label="Current stage" value={workspace?.kyc?.currentStage} />
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="space-y-5">
          <LockedItemsCard
            acceptedDocuments={workspace?.acceptedDocuments || []}
            video={workspace?.video}
          />
        </section>

        <section className="space-y-5">
          {workspace?.documentsNeedingResubmission?.length > 0 && (
            <CorrectionDocumentsCard
              documents={workspace.documentsNeedingResubmission}
              active={needsDocuments}
              onCorrectDocuments={onCorrectDocuments}
            />
          )}

          {workspace?.summary?.videoNeedsResubmission && (
            <CorrectionVideoCard
              video={workspace.video}
              active={needsVideo}
              disabled={needsDocuments}
              onCorrectVideo={onCorrectVideo}
            />
          )}

          {!needsDocuments && !needsVideo && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-start gap-3">
                <Clock3 size={20} className="mt-0.5 text-slate-500" />
                <div>
                  <p className="text-sm font-semibold text-navy">
                    No action needed right now
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Your correction status is currently under processing.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-8 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition active:scale-[0.98] hover:bg-slate-50"
      >
        <ArrowLeft size={16} />
        Back
      </button>
    </section>
  );
}

function LockedItemsCard({ acceptedDocuments, video }) {
  const videoAccepted = video?.status === "accepted";

  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-slate-200 shadow-sm text-emerald-600 shadow-sm">
          <ShieldCheck size={20} />
        </div>

        <div>
          <h2 className="text-base font-semibold text-navy">
            Already accepted items
          </h2>
          <p className="mt-1 text-sm leading-6 text-emerald-600">
            These items are locked. No action is required for them.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {acceptedDocuments.length === 0 && !videoAccepted && (
          <p className="rounded-2xl bg-white p-4 text-sm text-slate-500">
            No accepted item yet.
          </p>
        )}

        {acceptedDocuments.map((doc) => (
          <LockedRow
            key={doc.id}
            icon={FileText}
            title={doc.documentName}
            subtitle="Document accepted"
          />
        ))}

        {videoAccepted && (
          <LockedRow
            icon={Video}
            title="Video Declaration"
            subtitle="Video accepted"
          />
        )}
      </div>
    </div>
  );
}

function CorrectionDocumentsCard({ documents, active, onCorrectDocuments }) {
  return (
    <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-slate-200 shadow-sm text-orange-600 shadow-sm">
          <RotateCcw size={20} />
        </div>

        <div>
          <h2 className="text-base font-semibold text-navy">
            Documents needing correction
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Please correct only the listed document. Reviewer reason is shown
            below.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {documents.map((doc) => (
          <CorrectionDocumentItem key={doc.id} doc={doc} />
        ))}
      </div>

      <button
        type="button"
        onClick={onCorrectDocuments}
        disabled={!active}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none sm:w-auto"
      >
        Correct documents
        <ArrowRight size={16} />
      </button>
    </div>
  );
}

function CorrectionVideoCard({ video, active, disabled, onCorrectVideo }) {
  return (
    <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-slate-200 shadow-sm text-orange-600 shadow-sm">
          <Video size={20} />
        </div>

        <div>
          <h2 className="text-base font-semibold text-navy">
            Video declaration needs correction
          </h2>

          <p className="mt-1 text-sm leading-6 text-slate-600">
            Record the declaration again using the new runtime code.
          </p>
        </div>
      </div>

      {video?.reviewerRemarks && (
        <div className="mt-5 rounded-2xl border border-orange-100 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">
            Reviewer reason
          </p>
          <p className="mt-2 text-sm leading-6 text-gray-800">
            {video.reviewerRemarks}
          </p>
        </div>
      )}

      {disabled && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          Complete document correction first. Video correction will unlock after
          corrected documents are submitted.
        </div>
      )}

      <button
        type="button"
        onClick={onCorrectVideo}
        disabled={!active || disabled}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none sm:w-auto"
      >
        Record video again
        <ArrowRight size={16} />
      </button>
    </div>
  );
}

function CorrectionDocumentItem({ doc }) {
  return (
    <div className="rounded-2xl border border-orange-100 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-navy">
            {doc.documentName}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Version {doc.currentVersion} • Cycle {doc.resubmissionCycle}
          </p>
        </div>

        <StatusPill status="pending" label={doc.status} />
      </div>

      {doc.reviewerRemarks && (
        <div className="mt-4 rounded-xl bg-orange-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">
            Reviewer reason
          </p>
          <p className="mt-2 text-sm leading-6 text-gray-800">
            {doc.reviewerRemarks}
          </p>
        </div>
      )}

      {doc.files?.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Current submitted file
          </p>

          {doc.files.map((file) => (
            <a
              key={file.id}
              href={`${API_BASE_URL}${file.fileUrl}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              <span className="truncate">{file.originalName}</span>
              <ExternalLink size={15} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function LockedRow({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
        <CheckCircle2 size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-navy">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>

      <Icon size={17} className="text-slate-400" />
    </div>
  );
}

function SummaryTile({ label, value, tone }) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "bg-orange-50 text-orange-700"
        : "bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-2xl p-4 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-semibold text-navy">
        {value || "—"}
      </p>
    </div>
  );
}

function FinalState({ type, title, description, onBack }) {
  const isApproved = type === "approved";
  const isRejected = type === "rejected";

  return (
    <section className="rounded-2xl border border-white/80 bg-white/90 p-8 text-center shadow-xl shadow-gray-200/70">
      <div
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${
          isApproved
            ? "bg-emerald-50 text-emerald-600"
            : isRejected
              ? "bg-red-50 text-red-600"
              : "bg-blue-50 text-blue-600"
        }`}
      >
        {isApproved ? (
          <CheckCircle2 size={28} />
        ) : isRejected ? (
          <AlertCircle size={28} />
        ) : (
          <Clock3 size={28} />
        )}
      </div>

      <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em] text-navy">
        {title}
      </h1>

      <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-500">
        {description}
      </p>

      <button
        type="button"
        onClick={onBack}
        className="mt-8 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition active:scale-[0.98] hover:bg-slate-50"
      >
        <ArrowLeft size={16} />
        Back
      </button>
    </section>
  );
}
