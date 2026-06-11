import { useState } from "react";
import { CheckCircle2, RotateCcw, ShieldCheck, Video } from "lucide-react";
import { reviewerMediaUrl, reviewVideoDeclaration } from "../../api/kycApi";
import ReviewDecisionBox from "./ReviewDecisionBox";
import ReviewerBadge from "./ReviewerBadge";

function percent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

export default function VideoReviewCard({ videoDeclaration, caseStatus, onReviewed }) {
  const [showChangePanel, setShowChangePanel] = useState(false);

  if (!videoDeclaration) {
    return (
      <section className="rounded-[2rem] border border-red-100 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-red-700">
          No video declaration found.
        </p>
      </section>
    );
  }

  const isCaseClosed = ["approved", "rejected"].includes(caseStatus);
  const isAccepted = videoDeclaration.status === "accepted";
  const isResubmission = videoDeclaration.status === "resubmission_required";
  const isReviewed = isAccepted || isResubmission;

  const currentAttempt =
    videoDeclaration.attempts?.find(
      (attempt) => attempt.id === videoDeclaration.currentAttemptId
    ) || videoDeclaration.attempts?.[0];

  const quality = videoDeclaration.faceQualityMetadata || {};

  async function handleReview(payload) {
    const result = await reviewVideoDeclaration(videoDeclaration.id, payload);

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
            <Video size={20} />
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-950">
              Video declaration
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {videoDeclaration.declarantFullName} •{" "}
              {videoDeclaration.businessName}
            </p>
          </div>
        </div>

        <ReviewerBadge status={videoDeclaration.status} />
      </div>

      <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
          Runtime code
        </p>

        <p className="mt-2 text-3xl font-black tracking-[0.18em] text-gray-950">
          {videoDeclaration.runtimeCode}
        </p>

        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
          Script read by buyer
        </p>

        <p className="mt-2 text-sm leading-7 text-gray-800">
          {videoDeclaration.scriptText}
        </p>
      </div>

      {currentAttempt?.streamUrl && (
        <div className="mt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-950">
              Submitted video
            </p>

            <a
              href={reviewerMediaUrl(currentAttempt.streamUrl)}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              Open video
            </a>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-black">
            <video
              src={reviewerMediaUrl(currentAttempt.streamUrl)}
              controls
              preload="metadata"
              className="aspect-video w-full bg-black object-contain"
            />
          </div>
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-emerald-600" />
          <p className="text-sm font-semibold text-gray-950">
            Face quality report
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QualityStat label="Face visible" value={percent(quality.faceVisibleRatio)} />
          <QualityStat label="Single face" value={percent(quality.singleFaceRatio)} />
          <QualityStat label="Centered" value={percent(quality.centeredRatio)} />
          <QualityStat label="Lighting" value={percent(quality.lightingOkRatio)} />
          <QualityStat label="Stable" value={percent(quality.stableRatio)} />
          <QualityStat label="Duration" value={`${quality.durationSeconds || "—"}s`} />
          <QualityStat label="Checks" value={quality.totalChecks || "—"} />
          <QualityStat label="Multiple faces" value={quality.multipleFaceCount || 0} />
        </div>
      </div>

      {videoDeclaration.reviewerRemarks && (
        <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600">
            Reviewer remarks
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            {videoDeclaration.reviewerRemarks}
          </p>
        </div>
      )}

      {isAccepted && (
        <ReviewResultCard
          type="accepted"
          title="Video accepted"
          description="This video declaration is verified and ready for final approval."
        />
      )}

      {isResubmission && (
        <ReviewResultCard
          type="resubmission"
          title="Video resubmission requested"
          description="Buyer will be asked to record and submit the video declaration again."
        />
      )}

      {!isReviewed && !isCaseClosed && (
        <div className="mt-5">
          <ReviewDecisionBox
            title="Video decision"
            acceptLabel="Accept video"
            resubmitLabel="Ask video resubmission"
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
                Use this only if the earlier video review was done by mistake.
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
                title="Change video decision"
                acceptLabel="Accept video"
                resubmitLabel="Ask video resubmission"
                onSubmit={handleReview}
              />
            </div>
          )}
        </div>
      )}

      {isCaseClosed && (
        <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm font-medium text-gray-600">
          This KYC is already {caseStatus}. Video review is locked.
        </div>
      )}
    </section>
  );
}

function QualityStat({ label, value }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-gray-950">{value}</p>
    </div>
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
