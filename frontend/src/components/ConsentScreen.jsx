import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  LockKeyhole,
  ShieldCheck
} from "lucide-react";
import SectionCard from "./ui/SectionCard";
import useAudioGuide from "../hooks/useAudioGuide";

const content = {
  en: {
    title: "Consent",
    subtitle: "Please review what you're agreeing to, then tap “I agree” to continue.",
    pointsTitle: "By continuing, you agree to:",
    agreeLabel: "I agree to all of the above",
    submit: "Accept and continue",
    submitting: "Recording consent...",
    back: "Back",
    next: "Continue to document upload",
    completedTitle: "Consent recorded",
    completedText:
      "Your KYC session has started. Next, upload the required documents step by step.",
    consents: [
      {
        icon: ShieldCheck,
        tone: "blue",
        title: "Authorization",
        desc: "I am authorized to submit KYC details for this entity."
      },
      {
        icon: LockKeyhole,
        tone: "purple",
        title: "Information usage",
        desc: "My information may be used for KYC verification, encrypted in transit and at rest."
      },
      {
        icon: FileCheck2,
        tone: "amber",
        title: "Document processing",
        desc: "I consent to document checks, OCR, manual review, and logical verification."
      },
      {
        icon: Clock3,
        tone: "rose",
        title: "Video declaration",
        desc: "I consent to a live photo/video declaration where required. It stays private."
      }
    ]
  },
  hi: {
    title: "Consent",
    subtitle: "नीचे दी गई बातें पढ़ें और continue करने के लिए “I agree” tap करें।",
    pointsTitle: "Continue करने पर आप agree करते हैं:",
    agreeLabel: "मैं ऊपर दी सभी बातों से agree करता/करती हूँ",
    submit: "Accept करके continue करें",
    submitting: "Consent record हो रही है...",
    back: "Back",
    next: "Document upload पर जाएँ",
    completedTitle: "Consent record हो गई",
    completedText:
      "आपका KYC session start हो गया है। अब required documents एक-एक करके upload करें।",
    consents: [
      {
        icon: ShieldCheck,
        tone: "blue",
        title: "Authorization",
        desc: "मैं इस entity की KYC details submit करने के लिए authorized हूँ।"
      },
      {
        icon: LockKeyhole,
        tone: "purple",
        title: "Information usage",
        desc: "मेरी information KYC verification के लिए use हो सकती है, encrypted रहेगी।"
      },
      {
        icon: FileCheck2,
        tone: "amber",
        title: "Document processing",
        desc: "मैं document checks, OCR, manual review और verification के लिए consent देता/देती हूँ।"
      },
      {
        icon: Clock3,
        tone: "rose",
        title: "Video declaration",
        desc: "जहाँ required हो, मैं live photo/video declaration के लिए consent देता/देती हूँ।"
      }
    ]
  }
};

const TONE = {
  blue: "bg-blue-50 text-blue-700",
  purple: "bg-violet-50 text-violet-700",
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-700"
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
  useAudioGuide("3");

  const t = content[language] || content.en;
  const [agreed, setAgreed] = useState(false);

  async function handleSubmit() {
    if (!agreed || isSubmitting) return;
    // One "I agree" maps to all four canonical backend consent flags
    // (the API validates each strictly === true).
    await onSubmit({
      language,
      consentVersion: "v1",
      acceptedTerms: true,
      acceptedPrivacy: true,
      acceptedDocumentProcessing: true,
      acceptedVideoRecording: true
    });
  }

  if (isCompleted) {
    return (
      <SectionCard title={t.completedTitle}>
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-600">
            <CheckCircle2 size={30} />
          </div>
          <p className="max-w-md text-sm leading-7 text-slate-500">
            {t.completedText}
          </p>
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Current stage
            </p>
            <p className="mt-1.5 text-sm font-semibold text-navy">
              {kyc?.currentStage?.replaceAll("_", " ") || "consent completed"}
            </p>
          </div>
          <button
            type="button"
            onClick={onNext}
            className="inline-flex min-h-12 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white transition hover:bg-navy/90"
          >
            {t.next}
            <ArrowRight size={17} />
          </button>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t.title} subtitle={t.subtitle}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
        {t.pointsTitle}
      </p>

      <div className="mt-3 space-y-2.5">
        {t.consents.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.title}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  TONE[c.tone] || TONE.blue
                }`}
              >
                <Icon size={17} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy">{c.title}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">{c.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Single agree */}
      <button
        type="button"
        onClick={() => setAgreed((v) => !v)}
        className={`mt-5 flex min-h-12 w-full items-center gap-3 rounded-xl border p-4 text-left transition ${
          agreed
            ? "border-green-200 bg-green-50"
            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
        }`}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${
            agreed
              ? "border-success bg-success text-white"
              : "border-slate-300 bg-white text-transparent"
          }`}
        >
          <CheckCircle2 size={16} />
        </span>
        <span className="text-sm font-semibold text-navy">{t.agreeLabel}</span>
      </button>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!agreed || isSubmitting}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
        >
          {isSubmitting ? t.submitting : t.submit}
          {!isSubmitting ? <ArrowRight size={17} /> : null}
        </button>

        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          <ArrowLeft size={17} />
          {t.back}
        </button>
      </div>
    </SectionCard>
  );
}
