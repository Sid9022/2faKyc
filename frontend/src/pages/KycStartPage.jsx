import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole } from "lucide-react";

import { openKycLink, submitKycConsent } from "../api/kycApi";
import BuyerLayout from "../components/layout/BuyerLayout";
import ErrorState from "../components/ErrorState";
import KycChecklist from "../components/KycChecklist";
import LoadingScreen from "../components/LoadingScreen";
import SectionCard from "../components/ui/SectionCard";
import StatusPill from "../components/StatusPill";
import ConsentScreen from "../components/ConsentScreen";
import DocumentUploadWizard from "../components/DocumentUploadWizard";
import VideoDeclarationScreen from "../components/VideoDeclarationScreen";
import ResubmissionPortal from "../components/ResubmissionPortal";
import { formatStatusLabel } from "../components/statusStyles";

const copy = {
  en: {
    detailsTitle: "Welcome",
    detailsSubtitle:
      "Let's verify your KYC. It takes about 4–6 minutes — one short step at a time.",
    entity: "Entity type",
    service: "Service",
    pan: "PAN",
    expires: "Link expires",
    privacyText:
      "Your documents are used only for verification. Every action is logged securely.",
    nextDocuments: "Next: required documents",
    requirementsTitle: "Required documents",
    requirementsSubtitle:
      "Keep these ready. You'll upload only what applies to you.",
    nextConsent: "Continue to consent",
    back: "Back",
    doneTitle: "KYC submitted successfully",
    doneText:
      "Your documents and video declaration are submitted for review. If changes are needed, only the failed item will reopen.",
    language: "Language"
  },
  hi: {
    detailsTitle: "स्वागत है",
    detailsSubtitle:
      "आइए आपका KYC verify करें। इसमें लगभग 4–6 मिनट लगेंगे — एक बार में एक छोटा step।",
    entity: "Entity type",
    service: "Service",
    pan: "PAN",
    expires: "Link expires",
    privacyText:
      "आपके documents सिर्फ verification के लिए use होते हैं। हर action securely log होता है।",
    nextDocuments: "आगे: required documents",
    requirementsTitle: "Required documents",
    requirementsSubtitle:
      "इन्हें ready रखें। आप सिर्फ वही upload करेंगे जो आप पर लागू होता है।",
    nextConsent: "Consent पर जाएँ",
    back: "Back",
    doneTitle: "KYC successfully submit हो गया",
    doneText:
      "आपके documents और video declaration review के लिए submit हो गए हैं। बदलाव की जरूरत होने पर सिर्फ failed item reopen होगा।",
    language: "भाषा"
  }
};

// Milestones shown in the BuyerLayout stepper / progress bar.
const STEP_ORDER = [
  { key: "details", label: "Details" },
  { key: "consent", label: "Consent" },
  { key: "documents", label: "Documents" },
  { key: "video", label: "Video" },
  { key: "done", label: "Submit" }
];

// Internal step -> progress milestone (keeps the % clean: 20/40/60/80/100).
function progressKeyFor(step) {
  if (step === "details" || step === "requirements") return "details";
  if (step === "consent" || step === "consent_done") return "consent";
  if (step === "resubmission" || step === "resubmission_documents") return "documents";
  if (step === "resubmission_video") return "video";
  if (step === "documents" || step === "video" || step === "done") return step;
  return "details";
}

function deriveStep(kyc) {
  if (!kyc) return "details";
  if (
    kyc.overallStatus === "resubmission_required" ||
    kyc.currentStage?.startsWith("resubmission")
  ) {
    return "resubmission";
  }
  // Already submitted → stay on the completion view (and 100%) even on reload.
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
  return "details";
}

export default function KycStartPage() {
  const { token } = useParams();

  const [language, setLanguage] = useState("en");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const hasLoadedRef = useRef(false);

  const [step, setStep] = useState("details");
  const [isSubmittingConsent, setIsSubmittingConsent] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [consentResult, setConsentResult] = useState(null);

  const [locationCoords, setLocationCoords] = useState(null);

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
      setData((prev) => ({ ...prev, kyc: result.kyc || prev.kyc }));
      setStep("documents");
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
        setError({ title: "KYC link unavailable", message: result.message });
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

  if (isLoading) return <LoadingScreen />;

  if (error) {
    return (
      <ErrorState title={error.title} message={error.message} onRetry={loadKyc} />
    );
  }

  const kyc = data?.kyc;
  const link = data?.link;

  // Wide steps (the upload/video wizards) get the full content width; the short
  // intro/consent/done screens are centered and narrow for a focused mobile feel.
  const narrow = (node) => (
    <div className="mx-auto w-full max-w-2xl">{node}</div>
  );

  let body;
  if (step === "resubmission") {
    body = (
      <ResubmissionPortal
        token={token}
        language={language}
        onCorrectDocuments={() => setStep("resubmission_documents")}
        onCorrectVideo={() => setStep("resubmission_video")}
        onBack={() => setStep("details")}
      />
    );
  } else if (step === "resubmission_documents") {
    body = (
      <DocumentUploadWizard
        token={token}
        language={language}
        onBack={() => setStep("resubmission")}
        onResubmissionDone={() => setStep("resubmission")}
      />
    );
  } else if (step === "resubmission_video") {
    body = (
      <VideoDeclarationScreen
        token={token}
        language={language}
        buyerName={kyc?.buyerName}
        onBack={() => setStep("resubmission")}
        onSubmitted={() => setStep("resubmission")}
      />
    );
  } else if (step === "documents") {
    body = (
      <DocumentUploadWizard
        token={token}
        language={language}
        onBack={() => setStep("requirements")}
        onNextVideo={(coords) => {
          if (coords) setLocationCoords(coords);
          setStep("video");
        }}
      />
    );
  } else if (step === "video") {
    body = (
      <VideoDeclarationScreen
        token={token}
        language={language}
        buyerName={kyc?.buyerName}
        locationCoords={locationCoords}
        onBack={() => setStep("documents")}
        onSubmitted={() => setStep("done")}
      />
    );
  } else if (step === "done") {
    body = narrow(<DoneCard t={t} kyc={kyc} />);
  } else if (step === "consent" || step === "consent_done") {
    body = narrow(
      <ConsentScreen
        language={language}
        kyc={kyc}
        onBack={() => setStep("requirements")}
        onSubmit={handleSubmitConsent}
        onNext={() => setStep("documents")}
        isSubmitting={isSubmittingConsent}
        error={consentError}
        isCompleted={step === "consent_done"}
        result={consentResult}
      />
    );
  } else if (step === "requirements") {
    body = narrow(
      <RequirementsScreen
        t={t}
        checklist={kyc?.checklist || []}
        onBack={() => setStep("details")}
        onNext={() => setStep("consent")}
      />
    );
  } else {
    body = narrow(
      <DetailsScreen
        t={t}
        kyc={kyc}
        link={link}
        requiredDocsCount={requiredDocsCount}
        onNext={() => setStep("requirements")}
      />
    );
  }

  return (
    <BuyerLayout
      step={progressKeyFor(step)}
      steps={STEP_ORDER}
      buyerName={kyc?.buyerName}
      entityLabel={kyc?.entityLabel}
      language={language}
      onLanguageChange={setLanguage}
    >
      {body}
    </BuyerLayout>
  );
}

function DetailsScreen({ t, kyc, link, requiredDocsCount, onNext }) {
  return (
    <SectionCard
      title={`${t.detailsTitle}, ${kyc?.buyerName || ""}`.trim()}
      subtitle={t.detailsSubtitle}
      actions={<StatusPill status="active" label="Link verified" />}
      bodyClassName="space-y-5"
    >
      <div className="grid grid-cols-2 gap-3">
        <InfoCard label={t.entity} value={kyc?.entityLabel} />
        <InfoCard label={t.service} value={kyc?.serviceType} />
        <InfoCard label={t.pan} value={kyc?.panMasked} />
        <InfoCard label={t.expires} value={formatDate(link?.expiresAt)} />
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
        <LockKeyhole size={18} className="mt-0.5 shrink-0 text-blue-700" />
        <p className="text-xs leading-5 text-slate-600">{t.privacyText}</p>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white transition hover:bg-navy/90 active:scale-[0.99]"
      >
        {t.nextDocuments}
        <ArrowRight size={17} />
      </button>
    </SectionCard>
  );
}

function RequirementsScreen({ t, checklist, onBack, onNext }) {
  return (
    <SectionCard
      title={t.requirementsTitle}
      subtitle={t.requirementsSubtitle}
      bodyClassName="space-y-5"
    >
      <KycChecklist checklist={checklist} embedded />

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <button
          type="button"
          onClick={onNext}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white transition hover:bg-navy/90 sm:w-auto"
        >
          {t.nextConsent}
          <ArrowRight size={17} />
        </button>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
        >
          <ArrowLeft size={17} />
          {t.back}
        </button>
      </div>
    </SectionCard>
  );
}

function DoneCard({ t, kyc }) {
  return (
    <SectionCard
      title={t.doneTitle}
      actions={
        <StatusPill
          status={kyc?.overallStatus || "submitted"}
          label={formatStatusLabel(kyc?.overallStatus || "submitted")}
        />
      }
    >
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-600">
          <CheckCircle2 size={32} />
        </div>
        <p className="mx-auto max-w-md text-sm leading-7 text-slate-500">
          {t.doneText}
        </p>
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Current stage
          </p>
          <p className="mt-1.5 text-sm font-semibold text-navy">
            {kyc?.currentStage?.replaceAll("_", " ") || "buyer submission completed"}
          </p>
        </div>
      </div>
    </SectionCard>
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

function formatDate(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}
