import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock3, LockKeyhole } from "lucide-react";

import { openKycLink, submitKycConsent } from "../api/kycApi";
import BuyerLayout from "../components/layout/BuyerLayout";
import ErrorState from "../components/ErrorState";
import KycChecklist from "../components/KycChecklist";
import LoadingScreen from "../components/LoadingScreen";
import SectionCard from "../components/ui/SectionCard";
import StatCard from "../components/ui/StatCard";
import StatusPill from "../components/StatusPill";
import ConsentScreen from "../components/ConsentScreen";
import DocumentUploadWizard from "../components/DocumentUploadWizard";
import VideoDeclarationScreen from "../components/VideoDeclarationScreen";
import ResubmissionPortal from "../components/ResubmissionPortal";
import { formatStatusLabel } from "../components/statusStyles";

const copy = {
  en: {
    title: "Complete your KYC in a few simple steps.",
    subtitle:
      "Your link is verified. Review the required documents and continue when you are ready.",
    entity: "Entity type",
    service: "Service requested",
    pan: "PAN",
    estimate: "Estimated time",
    estimateValue: "4–6 minutes",
    privacyTitle: "Your information is protected",
    privacyText:
      "Your documents will be used only for verification. Every action is logged securely with timestamp and device details.",
    continue: "Continue to consent",
    note: "Next step will collect your consent before any document upload.",
    language: "Language",
    nextStepsTitle: "What happens next",
    nextSteps: [
      "Review and accept the consent terms.",
      "Upload each required document (auto-saved as you go).",
      "Record a short live video declaration.",
      "Submit — we handle the rest."
    ],
    expires: "Link expires",
    documents: "Documents"
  },
  hi: {
    title: "अपना KYC कुछ आसान steps में पूरा करें।",
    subtitle:
      "आपका link verify हो गया है। Required documents check करें और ready होने पर continue करें।",
    entity: "Entity type",
    service: "Service requested",
    pan: "PAN",
    estimate: "Estimated time",
    estimateValue: "4–6 minutes",
    privacyTitle: "आपकी जानकारी सुरक्षित है",
    privacyText:
      "आपके documents सिर्फ verification के लिए use होंगे। हर action timestamp और device details के साथ securely log होगा।",
    continue: "Consent पर जाएँ",
    note: "Next step में document upload से पहले आपकी consent ली जाएगी।",
    language: "भाषा",
    nextStepsTitle: "आगे क्या होगा",
    nextSteps: [
      "Consent terms review और accept करें।",
      "हर required document upload करें (auto-save होता जाएगा)।",
      "एक छोटा live video declaration record करें।",
      "Submit करें — बाकी हम handle करेंगे।"
    ],
    expires: "Link expires",
    documents: "Documents"
  }
};

const STEP_ORDER = [
  { key: "consent", label: "Consent" },
  { key: "documents", label: "Documents" },
  { key: "video", label: "Video" },
  { key: "done", label: "Submit" }
];

function deriveStep(kyc) {
  if (!kyc) return "welcome";
  if (
    kyc.overallStatus === "resubmission_required" ||
    kyc.currentStage?.startsWith("resubmission")
  ) {
    return "resubmission";
  }
  // Once the buyer has fully submitted, keep them on the completion
  // view even after a reload — otherwise the progress bar regresses
  // to "Step 3 of 4 (Video) 75%".
  if (
    kyc.overallStatus === "submitted" ||
    kyc.overallStatus === "approved" ||
    kyc.overallStatus === "rejected" ||
    kyc.currentStage === "buyer_submission_completed"
  ) {
    return "done";
  }
  if (
    kyc.currentStage === "documents_completed" ||
    kyc.currentStage === "video_declaration_started"
  ) {
    return "video";
  }
  if (
    kyc.currentStage === "consent_completed" ||
    kyc.currentStage === "document_upload_in_progress"
  ) {
    return "documents";
  }
  if (kyc.overallStatus === "in_progress") {
    return "documents";
  }
  return "welcome";
}

export default function KycStartPage() {
  const { token } = useParams();

  const [language, setLanguage] = useState("en");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const hasLoadedRef = useRef(false);

  const [step, setStep] = useState("welcome");
  const [isSubmittingConsent, setIsSubmittingConsent] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [consentResult, setConsentResult] = useState(null);

  const t = copy[language];

  async function handleSubmitConsent(payload) {
    try {
      setIsSubmittingConsent(true);
      setConsentError("");

      const result = await submitKycConsent(token, payload);

      if (!result.success) {
        setConsentError(result.message || "Unable to record consent.");
        return;
      }

      setConsentResult(result);

      setData((prev) => ({
        ...prev,
        kyc: result.kyc || prev.kyc
      }));

      setStep("consent_done");
    } catch (err) {
      setConsentError(
        err?.response?.data?.message ||
          "Unable to record consent. Please try again."
      );
    } finally {
      setIsSubmittingConsent(false);
    }
  }

  async function loadKyc() {
    try {
      setIsLoading(true);
      setError(null);

      const result = await openKycLink(token);

      if (!result.success) {
        setError({
          title: "KYC link unavailable",
          message: result.message
        });
        return;
      }

      setData(result);
      setStep(deriveStep(result.kyc));
    } catch (err) {
      setError({
        title: "Unable to open KYC link",
        message:
          err?.response?.data?.message ||
          "Please check your internet connection and try again."
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (hasLoadedRef.current) return;

    hasLoadedRef.current = true;
    loadKyc();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const requiredDocsCount = useMemo(() => {
    return data?.kyc?.checklist?.filter((item) => item.required).length || 0;
  }, [data]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <ErrorState
        title={error.title}
        message={error.message}
        onRetry={loadKyc}
      />
    );
  }

  const kyc = data?.kyc;
  const link = data?.link;

  return (
    <BuyerLayout
      step={step}
      steps={STEP_ORDER}
      buyerName={kyc?.buyerName}
      entityLabel={kyc?.entityLabel}
      language={language}
      onLanguageChange={setLanguage}
    >
      {step === "resubmission" ? (
        <ResubmissionPortal
          token={token}
          language={language}
          onCorrectDocuments={() => setStep("resubmission_documents")}
          onCorrectVideo={() => setStep("resubmission_video")}
          onBack={() => setStep("welcome")}
        />
      ) : step === "resubmission_documents" ? (
        <DocumentUploadWizard
          token={token}
          language={language}
          onBack={() => setStep("resubmission")}
          onResubmissionDone={() => setStep("resubmission")}
        />
      ) : step === "resubmission_video" ? (
        <VideoDeclarationScreen
          token={token}
          language={language}
          buyerName={kyc?.buyerName}
          onBack={() => setStep("resubmission")}          onSubmitted={() => setStep("resubmission")}        />
      ) : step === "documents" ? (
        <DocumentUploadWizard
          token={token}
          language={language}
          onBack={() => setStep("welcome")}
          onNextVideo={() => setStep("video")}
        />
      ) : step === "video" ? (
        <VideoDeclarationScreen
          token={token}
          language={language}
          buyerName={kyc?.buyerName}
          onBack={() => setStep("documents")}
          onSubmitted={() => setStep("done")}
        />
      ) : step === "done" ? (
        <SectionCard
          title="KYC submitted successfully"
          subtitle="Your documents and video declaration are submitted for review. If changes are needed, only the failed item will reopen."
          actions={
            <StatusPill
              status={kyc?.overallStatus || "submitted"}
              label={formatStatusLabel(kyc?.overallStatus || "submitted")}
            />
          }
        >
          <div className="flex flex-col items-center gap-5 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">
                KYC submitted successfully
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">
                Your documents and video declaration are submitted for review.
                If changes are needed, only the failed item will reopen.
              </p>
            </div>
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Current stage
              </p>
              <p className="mt-2 text-sm font-semibold text-navy">
                buyer submission completed
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStep("welcome")}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700"
            >
              ← Back
            </button>
          </div>
        </SectionCard>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {step === "welcome" || step === "consent" || step === "consent_done" ? (
            <SectionCard
              title={step === "welcome" ? t.title : "Consent"}
              subtitle={
                step === "welcome" ? t.subtitle : "Review and accept to continue with your documents."
              }
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status="active" label="Link verified" />
                  {kyc?.overallStatus ? (
                    <StatusPill
                      status={kyc.overallStatus}
                      label={formatStatusLabel(kyc.overallStatus)}
                    />
                  ) : null}
                </div>
              }
              bodyClassName="space-y-6"
            >
              {step === "welcome" ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InfoCard label={t.entity} value={kyc?.entityLabel} />
                    <InfoCard label={t.service} value={kyc?.serviceType} />
                    <InfoCard label={t.pan} value={kyc?.panMasked} />
                    <InfoCard label={t.estimate} value={t.estimateValue} />
                  </div>

                  <NextStepsCard title={t.nextStepsTitle} steps={t.nextSteps} />

                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:p-5">
                    <div className="flex gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm">
                        <LockKeyhole size={20} />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-navy">{t.privacyTitle}</h2>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{t.privacyText}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => setStep("consent")}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-navy/90 active:scale-[0.99] sm:w-auto"
                    >
                      {t.continue}
                      <ArrowRight size={17} />
                    </button>
                    <p className="text-sm leading-6 text-slate-500">{t.note}</p>
                  </div>
                </>
              ) : (
                <ConsentScreen
                  language={language}
                  kyc={kyc}
                  onBack={() => setStep("welcome")}
                  onSubmit={handleSubmitConsent}
                  onNext={() => setStep("documents")}
                  isSubmitting={isSubmittingConsent}
                  error={consentError}
                  isCompleted={step === "consent_done"}
                  result={consentResult}
                />
              )}
            </SectionCard>
          ) : null}

          <aside className="flex flex-col gap-6">
            <SectionCard
              title={`Welcome, ${kyc?.buyerName || ""}`}
              subtitle="Your secure KYC link has been opened successfully."
            >
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  icon={Clock3}
                  label={t.expires}
                  value={formatDate(link?.expiresAt)}
                  tone="navy"
                />
                <StatCard
                  icon={CheckCircle2}
                  label={t.documents}
                  value={`${requiredDocsCount} required`}
                  tone="green"
                />
              </div>
            </SectionCard>

            <SectionCard title="Required documents" subtitle="What you'll need to submit.">
              <KycChecklist checklist={kyc?.checklist || []} embedded />
            </SectionCard>
          </aside>
        </div>
      )}
    </BuyerLayout>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-1.5 truncate text-sm font-semibold text-navy">
        {value || "—"}
      </p>
    </div>
  );
}

function NextStepsCard({ title, steps }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <p className="text-sm font-bold text-navy">{title}</p>
      <ol className="mt-3 space-y-2.5">
        {steps.map((label, i) => (
          <li key={i} className="flex items-start gap-3 text-sm leading-6 text-slate-600">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy/5 text-[11px] font-bold text-navy">
              {i + 1}
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatDate(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}