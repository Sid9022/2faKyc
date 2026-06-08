import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  LockKeyhole,
  ShieldCheck
} from "lucide-react";

const content = {
  en: {
    title: "Before we continue, please review and accept consent.",
    subtitle:
      "We need your consent before collecting documents, photos, or video declaration for verification.",
    version: "Consent version",
    pointsTitle: "What you are agreeing to",
    authorized:
      "I confirm that I am authorized to submit KYC details for this entity.",
    privacy:
      "I agree that my submitted information may be used for KYC verification.",
    documents:
      "I consent to document checks, OCR extraction, manual review, and logical verification.",
    video:
      "I consent to live photo/video declaration where required for verification.",
    secureTitle: "Secure and auditable",
    secureText:
      "Your consent is stored with timestamp, IP address, and device details for audit purposes.",
    back: "Back",
    submit: "Accept and continue",
    submitting: "Recording consent...",
    completedTitle: "Consent recorded successfully",
    completedText:
      "Your KYC session has started. Next, we will collect the required documents step by step.",
    next: "Continue to document upload"
  },
  hi: {
    title: "आगे बढ़ने से पहले consent review और accept करें।",
    subtitle:
      "Documents, photos या video declaration collect करने से पहले आपकी consent जरूरी है।",
    version: "Consent version",
    pointsTitle: "आप किन बातों से agree कर रहे हैं",
    authorized:
      "मैं confirm करता/करती हूँ कि मैं इस entity की KYC details submit करने के लिए authorized हूँ।",
    privacy:
      "मैं agree करता/करती हूँ कि मेरी submitted information KYC verification के लिए use की जा सकती है।",
    documents:
      "मैं document checks, OCR extraction, manual review और logical verification के लिए consent देता/देती हूँ।",
    video:
      "जहाँ required हो, मैं live photo/video declaration के लिए consent देता/देती हूँ।",
    secureTitle: "Secure और auditable",
    secureText:
      "आपकी consent timestamp, IP address और device details के साथ audit के लिए store होगी।",
    back: "Back",
    submit: "Accept करके continue करें",
    submitting: "Consent record हो रही है...",
    completedTitle: "Consent successfully record हो गई",
    completedText:
      "आपका KYC session start हो गया है। Next step में required documents collect होंगे।",
    next: "Document upload पर जाएँ"
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

  const [checked, setChecked] = useState({
    acceptedTerms: false,
    acceptedPrivacy: false,
    acceptedDocumentProcessing: false,
    acceptedVideoRecording: false
  });

  const allAccepted = useMemo(() => {
    return Object.values(checked).every(Boolean);
  }, [checked]);

  function toggle(field) {
    setChecked((prev) => ({
      ...prev,
      [field]: !prev[field]
    }));
  }

  async function handleSubmit() {
    if (!allAccepted || isSubmitting) return;

    await onSubmit({
      language,
      consentVersion: "v1",
      ...checked
    });
  }

  if (isCompleted) {
    return (
      <div className="rounded-[2.5rem] border border-emerald-100 bg-white/90 p-6 shadow-xl shadow-emerald-100/60 backdrop-blur-xl sm:p-8 lg:p-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <CheckCircle2 size={28} />
        </div>

        <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em] text-gray-950 sm:text-4xl">
          {t.completedTitle}
        </h1>

        <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-500">
          {t.completedText}
        </p>

        <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
            Current stage
          </p>
          <p className="mt-2 text-sm font-semibold text-gray-950">
            {kyc?.currentStage?.replaceAll("_", " ") || "consent completed"}
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onNext}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-950 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-gray-300 transition-all hover:-translate-y-0.5 hover:bg-black"
          >
            {t.next}
            <ArrowRight size={17} />
          </button>

          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-6 py-3.5 text-sm font-semibold text-gray-700 transition-all hover:-translate-y-0.5 hover:bg-gray-50"
          >
            <ArrowLeft size={17} />
            {t.back}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[2.5rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-gray-200/70 backdrop-blur-xl sm:p-8 lg:p-10">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
          <ShieldCheck size={14} />
          Consent required
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
          {t.version}: v1
        </div>
      </div>

      <h1 className="mt-7 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-gray-950 sm:text-4xl">
        {t.title}
      </h1>

      <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-500">
        {t.subtitle}
      </p>

      <div className="mt-7 rounded-[2rem] border border-gray-100 bg-gray-50/80 p-5">
        <div className="flex gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-gray-700 shadow-sm">
            <FileCheck2 size={20} />
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-950">
              {kyc?.buyerName}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {kyc?.entityLabel} • {kyc?.panMasked}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-7">
        <h2 className="text-sm font-semibold text-gray-950">
          {t.pointsTitle}
        </h2>

        <div className="mt-4 space-y-3">
          <ConsentCheck
            checked={checked.acceptedTerms}
            onChange={() => toggle("acceptedTerms")}
            label={t.authorized}
          />

          <ConsentCheck
            checked={checked.acceptedPrivacy}
            onChange={() => toggle("acceptedPrivacy")}
            label={t.privacy}
          />

          <ConsentCheck
            checked={checked.acceptedDocumentProcessing}
            onChange={() => toggle("acceptedDocumentProcessing")}
            label={t.documents}
          />

          <ConsentCheck
            checked={checked.acceptedVideoRecording}
            onChange={() => toggle("acceptedVideoRecording")}
            label={t.video}
          />
        </div>
      </div>

      <div className="mt-7 rounded-[2rem] border border-blue-100 bg-blue-50/60 p-5">
        <div className="flex gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
            <LockKeyhole size={20} />
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-950">
              {t.secureTitle}
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-600">
              {t.secureText}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!allAccepted || isSubmitting}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-950 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-gray-300 transition-all hover:-translate-y-0.5 hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none disabled:hover:translate-y-0"
        >
          {isSubmitting ? t.submitting : t.submit}
          {!isSubmitting && <ArrowRight size={17} />}
        </button>

        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-6 py-3.5 text-sm font-semibold text-gray-700 transition-all hover:-translate-y-0.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ArrowLeft size={17} />
          {t.back}
        </button>
      </div>
    </div>
  );
}

function ConsentCheck({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition-all ${
        checked
          ? "border-emerald-200 bg-emerald-50/70"
          : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50"
      }`}
    >
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all ${
          checked
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-gray-300 bg-white text-transparent"
        }`}
      >
        <CheckCircle2 size={16} />
      </span>

      <span className="text-sm leading-6 text-gray-700">{label}</span>
    </button>
  );
}
