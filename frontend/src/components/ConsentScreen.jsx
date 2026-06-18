import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  FileCheck2,
  LockKeyhole,
  ShieldCheck
} from "lucide-react";

const content = {
  en: {
    stepLabel: "Consent",
    stepOf: "Step {current} of {total}",
    agree: "I agree",
    doNotAgree: "I do not agree",
    backToStep: "Previous",
    submit: "Accept and continue",
    submitting: "Recording consent...",
    progressPill: "{current} of {total} accepted",
    helpText:
      "Tap I agree for each statement. You can go back to revise previous answers. The continue button stays disabled until you agree with the current statement.",
    back: "Back",
    next: "Continue to document upload",
    completedTitle: "Consent recorded successfully",
    completedText:
      "Your KYC session has started. Next, we will collect the required documents step by step.",
    consents: [
      {
        key: "authorized",
        icon: ShieldCheck,
        tone: "blue",
        title: "Authorization",
        desc: "I confirm that I am authorized to submit KYC details for this entity. This includes verifying I have the right to act on behalf of the PAN holder."
      },
      {
        key: "privacy",
        icon: LockKeyhole,
        tone: "purple",
        title: "Information usage",
        desc: "I agree that my submitted information may be used for KYC verification. All data is encrypted in transit and at rest."
      },
      {
        key: "documents",
        icon: FileCheck2,
        tone: "amber",
        title: "Document processing",
        desc: "I consent to document checks, OCR extraction, manual review, and logical verification. Reviewers will only see what you submit."
      },
      {
        key: "video",
        icon: Clock3,
        tone: "rose",
        title: "Video declaration",
        desc: "I consent to live photo/video declaration where required for verification. The video stays private and is deleted after review."
      }
    ]
  },
  hi: {
    stepLabel: "Consent",
    stepOf: "Step {current} of {total}",
    agree: "मैं agree करता/करती हूँ",
    doNotAgree: "मैं agree नहीं करता/करती",
    backToStep: "पिछला",
    submit: "Accept करके continue करें",
    submitting: "Consent record हो रही है...",
    progressPill: "{current} of {total} accepted",
    helpText:
      "हर statement के लिए I agree tap करें। पिछले answers revise करने के लिए back जा सकते हैं। जब तक current statement agree नहीं करते, continue button disabled रहेगा।",
    back: "Back",
    next: "Document upload पर जाएँ",
    completedTitle: "Consent successfully record हो गई",
    completedText:
      "आपका KYC session start हो गया है। Next step में required documents collect होंगे।",
    consents: [
      {
        key: "authorized",
        icon: ShieldCheck,
        tone: "blue",
        title: "Authorization",
        desc: "मैं confirm करता/करती हूँ कि मैं इस entity की KYC details submit करने के लिए authorized हूँ।"
      },
      {
        key: "privacy",
        icon: LockKeyhole,
        tone: "purple",
        title: "Information usage",
        desc: "मैं agree करता/करती हूँ कि मेरी submitted information KYC verification के लिए use की जा सकती है।"
      },
      {
        key: "documents",
        icon: FileCheck2,
        tone: "amber",
        title: "Document processing",
        desc: "मैं document checks, OCR extraction, manual review और logical verification के लिए consent देता/देती हूँ।"
      },
      {
        key: "video",
        icon: Clock3,
        tone: "rose",
        title: "Video declaration",
        desc: "जहाँ required हो, मैं live photo/video declaration के लिए consent देता/देती हूँ।"
      }
    ]
  }
};

const TONE_STYLES = {
  blue: {
    bg: "bg-blue-50",
    ring: "ring-blue-100",
    text: "text-blue-700"
  },
  purple: {
    bg: "bg-purple-50",
    ring: "ring-purple-100",
    text: "text-purple-700"
  },
  amber: {
    bg: "bg-amber-50",
    ring: "ring-amber-100",
    text: "text-amber-700"
  },
  rose: {
    bg: "bg-rose-50",
    ring: "ring-rose-100",
    text: "text-rose-700"
  }
};

export default function ConsentScreen({
  language,
  kyc,
  onBack,
  onSubmit,
  onNext,
  isSubmitting,
  error,
  isCompleted
}) {
  const t = content[language] || content.en;
  const consents = t.consents;
  const totalSteps = consents.length;

  const [checked, setChecked] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);

  const acceptedCount = useMemo(
    () => consents.filter((c) => checked[c.key]).length,
    [checked, consents]
  );

  const current = consents[Math.min(currentIndex, totalSteps - 1)];
  const currentIsAccepted = Boolean(checked[current?.key]);
  const isLast = currentIndex >= totalSteps - 1;
  const isFirst = currentIndex === 0;

  function agreeCurrent() {
    if (!current) return;
    setChecked((prev) => ({ ...prev, [current.key]: true }));
    if (!isLast) {
      setCurrentIndex((i) => i + 1);
    }
  }

  function disagreeCurrent() {
    if (!current) return;
    setChecked((prev) => ({ ...prev, [current.key]: false }));
  }

  function goPrev() {
    if (!isFirst) setCurrentIndex((i) => i - 1);
  }

  function goNext() {
    if (!isLast) setCurrentIndex((i) => i + 1);
  }

  function jumpTo(index) {
    if (index < 0 || index >= totalSteps) return;
    if (index <= currentIndex) {
      setCurrentIndex(index);
      return;
    }
    for (let i = currentIndex; i < index; i++) {
      if (!checked[consents[i].key]) return;
    }
    setCurrentIndex(index);
  }

  async function handleSubmit() {
    if (isSubmitting) return;
    // Map the 4 UI consent keys (e.g. "authorized", "privacy") to the
    // canonical backend field names the API expects. The backend validates
    // each of these as strictly === true; missing/anything else -> 400.
    const payload = {
      language,
      consentVersion: "v1",
      acceptedTerms: Boolean(checked.authorized),
      acceptedPrivacy: Boolean(checked.privacy),
      acceptedDocumentProcessing: Boolean(checked.documents),
      acceptedVideoRecording: Boolean(checked.video)
    };
    await onSubmit(payload);
  }

  if (isCompleted) {
    return (
      <div className="space-y-5 pb-28 sm:pb-0">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <CheckCircle2 size={28} />
        </div>

        <h1 className="mt-6 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
          {t.completedTitle}
        </h1>

        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
          {t.completedText}
        </p>

        <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            All {totalSteps} consents accepted
          </p>
          <p className="mt-2 text-sm font-semibold text-navy">
            {kyc?.currentStage?.replaceAll("_", " ") || "consent completed"}
          </p>
        </div>

        {/* Mobile: sticky bottom action bar */}
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md sm:hidden"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
            >
              <ArrowLeft size={16} />
              {t.back}
            </button>
            <button
              type="button"
              onClick={onNext}
              className="inline-flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-white shadow-sm"
            >
              {t.next}
              <ArrowRight size={17} />
            </button>
          </div>
        </div>

        {/* Desktop: inline action bar */}
        <div className="mt-8 hidden flex-col gap-3 sm:flex-row sm:flex">
          <button
            type="button"
            onClick={onNext}
            className="inline-flex items-center justify-center gap-2 min-h-12 w-full rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-navy/90 active:scale-[0.99] sm:w-auto"
          >
            {t.next}
            <ArrowRight size={17} />
          </button>

          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft size={17} />
            {t.back}
          </button>
        </div>
      </div>
    );
  }

  const CurrentIcon = current?.icon || ShieldCheck;
  const currentTone = TONE_STYLES[current?.tone] || TONE_STYLES.blue;

  return (
    <div className="flex h-full flex-col pb-32 sm:pb-0">
      {/* Top: stepper pill + step counter */}
      <div className="flex items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
          <ShieldCheck size={14} />
          {t.stepLabel}
        </div>
        <div className="text-xs font-semibold text-slate-500">
          {t.stepOf
            .replace("{current}", currentIndex + 1)
            .replace("{total}", totalSteps)}
        </div>
      </div>

      {/* Progress bar — clickable to revisit agreed steps */}
      <div className="mt-4 flex items-center gap-1.5">
        {consents.map((c, i) => {
          const done = Boolean(checked[c.key]);
          const active = i === currentIndex;
          const canJump = i <= currentIndex || done;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => jumpTo(i)}
              disabled={!canJump}
              aria-label={c.title}
              className={`relative h-2 flex-1 overflow-hidden rounded-full transition ${
                done
                  ? "bg-emerald-500"
                  : active
                    ? "bg-slate-200"
                    : "bg-slate-100"
              } ${canJump ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
            />
          );
        })}
      </div>

      {/* Mobile: compact buyer chip */}
      <div className="mt-5 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:hidden">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-700 ring-1 ring-slate-200 shadow-sm">
          <FileCheck2 size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-navy">{kyc?.buyerName}</p>
          <p className="truncate text-xs text-slate-500">
            {kyc?.entityLabel} • {kyc?.panMasked}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700">
          {t.progressPill
            .replace("{current}", acceptedCount)
            .replace("{total}", totalSteps)}
        </span>
      </div>

      {/* Desktop: bigger buyer info card */}
      <div className="mt-6 hidden rounded-xl border border-slate-200 bg-slate-50/80 p-5 sm:flex">
        <div className="flex gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-slate-700 ring-1 ring-slate-200 shadow-sm">
            <FileCheck2 size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold text-navy">{kyc?.buyerName}</p>
            <p className="mt-1 text-sm text-slate-500">
              {kyc?.entityLabel} • {kyc?.panMasked}
            </p>
          </div>
        </div>
      </div>

      {/* The big consent card — current statement only */}
      <div className="mt-5 flex-1">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div
            className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${currentTone.bg} ${currentTone.text} ring-1 ${currentTone.ring}`}
          >
            <CurrentIcon size={22} />
          </div>

          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            {t.stepLabel} • {currentIndex + 1}/{totalSteps}
          </p>

          <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
            {current?.title}
          </h2>

          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            {current?.desc}
          </p>

          {/* Agreed indicator */}
          <div
            className={`mt-5 flex items-center gap-3 rounded-xl border p-3 transition ${
              currentIsAccepted
                ? "border-emerald-200 bg-emerald-50/70"
                : "border-slate-200 bg-slate-50/70"
            }`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all ${
                currentIsAccepted
                  ? "bg-emerald-500 text-white"
                  : "border border-slate-300 bg-white text-slate-300"
              }`}
            >
              {currentIsAccepted ? <CheckCircle2 size={16} /> : <Circle size={16} />}
            </span>
            <span
              className={`text-sm font-semibold ${
                currentIsAccepted ? "text-emerald-700" : "text-slate-500"
              }`}
            >
              {currentIsAccepted ? "Agreed" : "Not yet agreed"}
            </span>
          </div>
        </div>

        {/* Step list (desktop only) */}
        <div className="mt-4 hidden rounded-xl border border-slate-200 bg-white p-4 sm:block">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            All consents
          </p>
          <ol className="mt-3 space-y-2">
            {consents.map((c, i) => {
              const done = Boolean(checked[c.key]);
              const active = i === currentIndex;
              const CIcon = c.icon;
              return (
                <li
                  key={c.key}
                  className={`flex items-center gap-3 rounded-xl border p-3 ${
                    active
                      ? "border-navy bg-navy/5"
                      : done
                        ? "border-emerald-200 bg-emerald-50/50"
                        : "border-slate-200 bg-white"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      done
                        ? "bg-emerald-500 text-white"
                        : active
                          ? "bg-navy text-white"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {done ? <CheckCircle2 size={14} /> : i + 1}
                  </span>
                  <CIcon
                    size={16}
                    className={
                      done
                        ? "text-emerald-600"
                        : active
                          ? "text-navy"
                          : "text-slate-400"
                    }
                  />
                  <span
                    className={`text-sm font-semibold ${
                      active
                        ? "text-navy"
                        : done
                          ? "text-emerald-700"
                          : "text-slate-600"
                    }`}
                  >
                    {c.title}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700 sm:p-4">
          {error}
        </div>
      )}

      {/* Mobile: sticky bottom action bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md sm:hidden"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <span>
            {t.progressPill
              .replace("{current}", acceptedCount)
              .replace("{total}", totalSteps)}
          </span>
          <span className="text-navy">
            {acceptedCount === totalSteps
              ? "All set"
              : `Agree ${totalSteps - acceptedCount} more`}
          </span>
        </div>

        <div className="flex gap-2">
          {!isFirst ? (
            <button
              type="button"
              onClick={goPrev}
              className="inline-flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"
            >
              <ArrowLeft size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"
            >
              <ArrowLeft size={16} />
              {t.back}
            </button>
          )}

          {isLast && currentIsAccepted ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="inline-flex min-h-12 min-w-0 flex-[2] items-center justify-center gap-2 rounded-xl bg-navy px-3 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
            >
              {isSubmitting ? t.submitting : t.submit}
              {!isSubmitting && <ArrowRight size={16} />}
            </button>
          ) : (
            <button
              type="button"
              onClick={agreeCurrent}
              className="inline-flex min-h-12 min-w-0 flex-[2] items-center justify-center gap-2 rounded-xl bg-navy px-3 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99]"
            >
              {t.agree}
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Desktop: inline action bar */}
      <div className="mt-6 hidden flex-col gap-3 sm:flex">
        <div className="flex flex-wrap items-center gap-3">
          {!isFirst ? (
            <button
              type="button"
              onClick={goPrev}
              className="inline-flex items-center justify-center gap-2 min-h-12 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              {t.backToStep}
            </button>
          ) : (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center justify-center gap-2 min-h-12 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              {t.back}
            </button>
          )}

          {currentIsAccepted && !isLast ? (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center justify-center gap-2 min-h-12 rounded-full bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              Next statement
              <ChevronRight size={16} />
            </button>
          ) : null}

          {currentIsAccepted ? (
            <button
              type="button"
              onClick={disagreeCurrent}
              className="inline-flex items-center justify-center gap-2 min-h-12 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {t.doNotAgree}
            </button>
          ) : null}

          {isLast && currentIsAccepted ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 min-h-12 rounded-full bg-navy px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-navy/90 active:scale-[0.99] disabled:opacity-50"
            >
              {isSubmitting ? t.submitting : t.submit}
              {!isSubmitting && <ArrowRight size={16} />}
            </button>
          ) : (
            <button
              type="button"
              onClick={agreeCurrent}
              className="inline-flex items-center justify-center gap-2 min-h-12 rounded-full bg-navy px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-navy/90 active:scale-[0.99]"
            >
              {t.agree}
              <ChevronRight size={16} />
            </button>
          )}
        </div>

        <p className="text-xs leading-5 text-slate-500">{t.helpText}</p>
      </div>
    </div>
  );
}
