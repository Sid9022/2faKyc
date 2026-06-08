import { useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { applyKycFinalDecision } from "../../api/kycApi";
import ReviewerBadge from "./ReviewerBadge";

export default function FinalDecisionPanel({
  kycId,
  caseStatus,
  readiness,
  onDecision
}) {
  const [mode, setMode] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isClosed = ["approved", "rejected"].includes(caseStatus);

  const allRequiredDocsAccepted =
    readiness?.acceptedRequiredDocs === readiness?.totalRequiredDocs &&
    readiness?.totalRequiredDocs > 0;

  const videoAccepted = readiness?.videoAccepted;
  const failedItemsCount = readiness?.failedItemsCount || 0;

  const canApprove = allRequiredDocsAccepted && videoAccepted && !isClosed;
  const canAskResubmission = failedItemsCount > 0 && !isClosed;

  async function submitFinalDecision(decision, customRemarks = "") {
    try {
      setIsSubmitting(true);
      setMessage("");
      setError("");

      const result = await applyKycFinalDecision(kycId, {
        decision,
        remarks: customRemarks
      });

      if (!result.success) {
        setError(result.message || "Unable to apply final decision.");
        return;
      }

      setMessage(result.message);
      setMode(null);
      setRemarks("");
      await onDecision?.();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Unable to apply final decision. Please verify all required review steps."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-gray-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gray-50 text-gray-700">
          <ShieldCheck size={20} />
        </div>

        <div>
          <h2 className="text-base font-semibold text-gray-950">
            Final decision
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-500">
            Final approval unlocks only when all required documents and video are accepted.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <ReadinessRow
          label="Required documents"
          value={`${readiness?.acceptedRequiredDocs || 0}/${readiness?.totalRequiredDocs || 0} accepted`}
          ok={allRequiredDocsAccepted}
        />

        <ReadinessRow
          label="Video declaration"
          value={videoAccepted ? "accepted" : "not accepted"}
          ok={videoAccepted}
        />

        <ReadinessRow
          label="Failed / resubmission items"
          value={failedItemsCount}
          ok={failedItemsCount === 0}
        />
      </div>

      {isClosed && (
        <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm font-medium text-gray-600">
          This KYC is already {caseStatus}. Final action is locked.
        </div>
      )}

      {!isClosed && (
        <>
          <button
            type="button"
            onClick={() =>
              submitFinalDecision(
                "approved",
                "All required documents and video declaration verified."
              )
            }
            disabled={!canApprove || isSubmitting}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-100 transition active:scale-[0.98] hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
          >
            {isSubmitting && !mode ? (
              <Loader2 className="animate-spin" size={17} />
            ) : (
              <CheckCircle2 size={17} />
            )}
            Approve KYC
          </button>

          {!canApprove && (
            <p className="mt-2 text-xs leading-5 text-gray-500">
              Accept all required documents and video before final approval.
            </p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setMode((prev) =>
                  prev === "resubmission_required"
                    ? null
                    : "resubmission_required"
                );
                setMessage("");
                setError("");
              }}
              disabled={!canAskResubmission || isSubmitting}
              className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
                mode === "resubmission_required"
                  ? "bg-orange-600 text-white shadow-lg shadow-orange-100"
                  : "border border-orange-200 bg-white text-orange-700 hover:bg-orange-50"
              }`}
            >
              <RotateCcw size={17} />
              Ask resubmission
            </button>

            <button
              type="button"
              onClick={() => {
                setMode((prev) => (prev === "rejected" ? null : "rejected"));
                setMessage("");
                setError("");
              }}
              disabled={isSubmitting}
              className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
                mode === "rejected"
                  ? "bg-red-600 text-white shadow-lg shadow-red-100"
                  : "border border-red-200 bg-white text-red-700 hover:bg-red-50"
              }`}
            >
              <XCircle size={17} />
              Reject KYC
            </button>
          </div>

          {!canAskResubmission && (
            <p className="mt-2 text-xs leading-5 text-gray-500">
              Mark at least one document/video for resubmission before using resubmission final decision.
            </p>
          )}

          {mode && (
            <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <label className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
                {mode === "rejected"
                  ? "Rejection reason"
                  : "Resubmission reason"}
              </label>

              <textarea
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                rows={3}
                placeholder={
                  mode === "rejected"
                    ? "Explain why this KYC is rejected..."
                    : "Explain what the buyer needs to correct..."
                }
                className="mt-2 w-full resize-none rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-gray-400"
              />

              <button
                type="button"
                onClick={() => submitFinalDecision(mode, remarks)}
                disabled={isSubmitting || remarks.trim().length < 3}
                className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none sm:w-auto ${
                  mode === "rejected"
                    ? "bg-red-600 shadow-red-100 hover:bg-red-700"
                    : "bg-orange-600 shadow-orange-100 hover:bg-orange-700"
                }`}
              >
                {isSubmitting && <Loader2 className="animate-spin" size={17} />}
                Confirm {mode.replaceAll("_", " ")}
              </button>
            </div>
          )}
        </>
      )}

      {message && (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
          {message}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </div>
      )}
    </section>
  );
}

function ReadinessRow({ label, value, ok }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-gray-50 p-4">
      <div>
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="mt-1 text-xs text-gray-500">Required before final decision</p>
      </div>

      <ReviewerBadge
        status={ok ? "accepted" : "under_review"}
        label={value}
      />
    </div>
  );
}
