import { useState } from "react";
import { CheckCircle2, FileCheck2, RotateCcw } from "lucide-react";
import { reviewDocumentSubmission } from "../../api/kycApi";
import FilePreviewCard from "./FilePreviewCard";
import ReviewDecisionBox from "./ReviewDecisionBox";
import ReviewerBadge from "./ReviewerBadge";

export default function DocumentReviewCard({ document, caseStatus, onReviewed }) {
  const [showChangePanel, setShowChangePanel] = useState(false);

  const currentFiles = document.files?.filter((file) => file.isCurrent) || [];
  const oldFiles = document.files?.filter((file) => !file.isCurrent) || [];

  const isCaseClosed = ["approved", "rejected"].includes(caseStatus);
  const isAccepted = document.status === "accepted";
  const isResubmission = document.status === "resubmission_required";
  const isReviewed = isAccepted || isResubmission;

  async function handleReview(payload) {
    const result = await reviewDocumentSubmission(document.id, payload);

    if (result.success) {
      setShowChangePanel(false);
      await onReviewed?.();
    }

    return result;
  }

  return (
    <section className="rounded-[2rem] border border-gray-200/80 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gray-50 text-gray-700">
            <FileCheck2 size={20} />
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-950">
              {document.documentName}
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {document.documentKey} • {document.isRequired ? "Required" : "Optional"} •
              Version {document.currentVersion}
            </p>
          </div>
        </div>

        <ReviewerBadge status={document.status} />
      </div>

      {document.notes && (
        <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
            Buyer note
          </p>
          <p className="mt-1 text-sm leading-6 text-gray-700">
            {document.notes}
          </p>
        </div>
      )}

      {document.reviewerRemarks && (
        <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600">
            Reviewer remarks
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            {document.reviewerRemarks}
          </p>
        </div>
      )}

      <div className="mt-5 space-y-4">
        <p className="text-sm font-semibold text-gray-950">Current files</p>

        {currentFiles.length === 0 ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
            No current file found.
          </div>
        ) : (
          currentFiles.map((file) => (
            <FilePreviewCard key={file.id} file={file} />
          ))
        )}
      </div>

      {oldFiles.length > 0 && (
        <details className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700">
            View old versions ({oldFiles.length})
          </summary>

          <div className="mt-4 space-y-4">
            {oldFiles.map((file) => (
              <FilePreviewCard key={file.id} file={file} />
            ))}
          </div>
        </details>
      )}

      {isAccepted && (
        <ReviewResultCard
          type="accepted"
          title="Document accepted"
          description="This document is verified and will be counted toward final KYC approval."
        />
      )}

      {isResubmission && (
        <ReviewResultCard
          type="resubmission"
          title="Resubmission requested"
          description="Buyer will be asked to correct and upload this document again."
        />
      )}

      {!isReviewed && !isCaseClosed && (
        <div className="mt-5">
          <ReviewDecisionBox
            title="Document decision"
            acceptLabel="Accept document"
            resubmitLabel="Ask document resubmission"
            onSubmit={handleReview}
          />
        </div>
      )}

      {isReviewed && !isCaseClosed && (
        <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-950">
                Need to change this decision?
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Use this only if the earlier review was done by mistake.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowChangePanel((prev) => !prev)}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition active:scale-[0.98] hover:bg-gray-50"
            >
              <RotateCcw size={16} />
              Change decision
            </button>
          </div>

          {showChangePanel && (
            <div className="mt-4">
              <ReviewDecisionBox
                title="Change document decision"
                acceptLabel="Accept document"
                resubmitLabel="Ask document resubmission"
                onSubmit={handleReview}
              />
            </div>
          )}
        </div>
      )}

      {isCaseClosed && (
        <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm font-medium text-gray-600">
          This KYC is already {caseStatus}. Document review is locked.
        </div>
      )}
    </section>
  );
}

function ReviewResultCard({ type, title, description }) {
  const isAccepted = type === "accepted";

  return (
    <div
      className={`mt-5 rounded-2xl border px-4 py-3 ${
        isAccepted
          ? "border-emerald-100 bg-emerald-50 text-emerald-700"
          : "border-orange-100 bg-orange-50 text-orange-700"
      }`}
    >
      <div className="flex items-start gap-3">
        {isAccepted ? (
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
        ) : (
          <RotateCcw size={18} className="mt-0.5 shrink-0" />
        )}

        <div>
          <p className="text-sm font-bold">{title}</p>
          <p className="mt-1 text-xs leading-5">{description}</p>
        </div>
      </div>
    </div>
  );
}
