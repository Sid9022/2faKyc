import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Globe2,
  LockKeyhole,
  ShieldCheck
} from "lucide-react";

import { openKycLink, submitKycConsent } from "../api/kycApi";
import ErrorState from "../components/ErrorState";
import KycChecklist from "../components/KycChecklist";
import LanguageToggle from "../components/LanguageToggle";
import LoadingScreen from "../components/LoadingScreen";
import StatusPill from "../components/StatusPill";
import ConsentScreen from "../components/ConsentScreen";
import DocumentUploadWizard from "../components/DocumentUploadWizard";
import VideoDeclarationScreen from "../components/VideoDeclarationScreen";
import ResubmissionPortal from "../components/ResubmissionPortal";

const copy = {
  en: {
    secure: "Secure verification",
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
    language: "Language"
  },
  hi: {
    secure: "सुरक्षित सत्यापन",
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
    language: "भाषा"
  }
};

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
      if (
        result.kyc.overallStatus === "resubmission_required" ||
        result.kyc.currentStage?.startsWith("resubmission")
      ) {
        setStep("resubmission");
      } else if (
        result.kyc.currentStage === "documents_completed" ||
        result.kyc.currentStage === "video_declaration_started" ||
        result.kyc.currentStage === "buyer_submission_completed"
      ) {
        setStep("video");
      } else if (
        result.kyc.currentStage === "consent_completed" ||
        result.kyc.currentStage === "document_upload_in_progress"
      ) {
        setStep("documents");
      } else if (result.kyc.overallStatus === "in_progress") {
        setStep("documents");
      }
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
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex items-center justify-between rounded-[2rem] border border-white/80 bg-white/75 px-5 py-4 shadow-sm backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-950 text-white shadow-sm">
              <ShieldCheck size={22} />
            </div>

            <div>
              <p className="text-sm font-semibold tracking-tight text-gray-950">
                2Factor KYC
              </p>
              <p className="text-xs text-gray-500">{t.secure}</p>
            </div>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <Globe2 size={16} className="text-gray-400" />
            <LanguageToggle language={language} onChange={setLanguage} />
          </div>
        </header>

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
            onBack={() => setStep("resubmission")}
          />
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
          />
        ) : (
          <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            {step === "welcome" ? (
              <div className="rounded-[2.5rem] border border-white/80 bg-white/85 p-6 shadow-xl shadow-gray-200/70 backdrop-blur-xl sm:p-8 lg:p-10">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status="active" label="Link verified" />
                  <StatusPill
                    status={kyc?.overallStatus}
                    label={kyc?.overallStatus || "opened"}
                  />
                </div>

                <h1 className="mt-7 max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-gray-950 sm:text-5xl">
                  {t.title}
                </h1>

                <p className="mt-5 max-w-2xl text-base leading-7 text-gray-500">
                  {t.subtitle}
                </p>

                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <InfoCard label={t.entity} value={kyc?.entityLabel} />
                  <InfoCard label={t.service} value={kyc?.serviceType} />
                  <InfoCard label={t.pan} value={kyc?.panMasked} />
                  <InfoCard label={t.estimate} value={t.estimateValue} />
                </div>

                <div className="mt-8 rounded-[2rem] border border-blue-100 bg-blue-50/60 p-5">
                  <div className="flex gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
                      <LockKeyhole size={20} />
                    </div>

                    <div>
                      <h2 className="text-sm font-semibold text-gray-950">
                        {t.privacyTitle}
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-gray-600">
                        {t.privacyText}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-950 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-gray-300 transition-all hover:-translate-y-0.5 hover:bg-black active:translate-y-0"
                    onClick={() => {
                      if (
                        kyc?.overallStatus === "resubmission_required" ||
                        kyc?.currentStage?.startsWith("resubmission")
                      ) {
                        setStep("resubmission");
                      } else if (
                        kyc?.currentStage === "documents_completed" ||
                        kyc?.currentStage === "video_declaration_started" ||
                        kyc?.currentStage === "buyer_submission_completed"
                      ) {
                        setStep("video");
                      } else if (
                        kyc?.currentStage === "consent_completed" ||
                        kyc?.currentStage === "document_upload_in_progress"
                      ) {
                        setStep("documents");
                      } else {
                        setStep("consent");
                      }
                    }}
                  >
                    {kyc?.overallStatus === "resubmission_required" ||
                    kyc?.currentStage?.startsWith("resubmission")
                      ? "View correction request"
                      : kyc?.currentStage === "documents_completed" ||
                          kyc?.currentStage === "video_declaration_started" ||
                          kyc?.currentStage === "buyer_submission_completed"
                        ? "Continue video declaration"
                        : kyc?.currentStage === "consent_completed" ||
                            kyc?.currentStage === "document_upload_in_progress"
                          ? "Continue documents"
                          : t.continue}
                    <ArrowRight size={17} />
                  </button>

                  <p className="text-sm leading-6 text-gray-500">{t.note}</p>
                </div>
              </div>
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

            <aside className="flex flex-col gap-6">
              <div className="rounded-[2rem] border border-gray-200/80 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-950">
                      Welcome, {kyc?.buyerName}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-gray-500">
                      Your secure KYC link has been opened successfully.
                    </p>
                  </div>

                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <CheckCircle2 size={22} />
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <MiniStat
                    icon={Clock3}
                    label="Expires"
                    value={formatDate(link?.expiresAt)}
                  />
                  <MiniStat
                    icon={CheckCircle2}
                    label="Documents"
                    value={`${requiredDocsCount} required`}
                  />
                </div>
              </div>

              <div className="hidden sm:block md:hidden">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
                  {t.language}
                </div>
                <LanguageToggle language={language} onChange={setLanguage} />
              </div>

              <KycChecklist checklist={kyc?.checklist || []} />
            </aside>
          </section>
        )}
      </div>
    </main>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-semibold text-gray-950">
        {value || "—"}
      </p>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
      <div className="flex items-center gap-2 text-gray-400">
        <Icon size={16} />
        <span className="text-xs font-semibold uppercase tracking-[0.16em]">
          {label}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold text-gray-950">{value}</p>
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
