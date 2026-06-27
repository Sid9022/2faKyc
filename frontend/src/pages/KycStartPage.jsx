import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  LockKeyhole
} from "lucide-react";

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
import useAudioGuide from "../hooks/useAudioGuide";

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
    underReviewTitle: "Your KYC is being reviewed",
    underReviewText:
      "Your documents and video declaration have been submitted and are now being reviewed. We'll email you as soon as a decision is made.",
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
    underReviewTitle: "आपका KYC review हो रहा है",
    underReviewText:
      "आपके documents और video declaration submit हो चुके हैं और अब review किए जा रहे हैं। Decision आते ही हम आपको email करेंगे।",
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

// `deriveStep` and `progressKeyFor` live in `./buyerFlow.js` so they can
// be unit-tested with the built-in `node --test` runner (the component
// file is JSX). See /frontend/tests/buyerFlow.test.js for the regression
// cases for bugs A1, A3, A4, A10.
import { deriveStep, progressKeyFor } from "./buyerFlow";

export default function KycStartPage() {
  const { token } = useParams();

  const [language, setLanguage] = useState("en");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Bug A21: AbortController for in-flight `loadKyc` so a token change
  // mid-request cancels the stale one instead of letting it overwrite
  // the new token's data.
  const abortRef = useRef(null);

  // Bug A16: counter that increments every time the parent flips back
  // to the `resubmission` step. We pass it as part of the React `key`
  // to ResubmissionPortal so the component remounts (and its
  // `useEffect([token])` re-fires) on every round-trip.
  const [portalKey, setPortalKey] = useState(0);

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

  async function loadKyc({ silent = false } = {}) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (!silent) setIsLoading(true);
      setError(null);

      const result = await openKycLink(token, { signal: controller.signal });

      if (!result.success) {
        setError({ title: "KYC link unavailable", message: result.message });
        return;
      }

      setData(result);
      setStep(deriveStep(result.kyc));
    } catch (err) {
      // If this request was aborted by a newer one, do nothing — the
      // newer request will populate state.
      if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") {
        return;
      }
      setError({
        title: "Unable to open KYC link",
        message:
          err?.response?.data?.message ||
          "Please check your internet connection and try again."
      });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        if (!silent) setIsLoading(false);
      }
    }
  }

  // Bug A20 + A21: re-fetch whenever the token changes (within the same
  // mount). The previous `hasLoadedRef` short-circuited this so a
  // second token in the same tab would keep showing the first
  // buyer's PII. Sub-flows also call `refreshKyc` via `onStatusChanged`
  // so the parent's `data.kyc` is fresh after every state change.
  useEffect(() => {
    // Reset state when the token changes. The setState-in-effect lint
    // warning matches the pre-existing pattern in this file (the old
    // `loadKyc` body also ran inside `useEffect` without a flag).
    setData(null);
    setError(null);
    setStep("details");
    setLocationCoords(null);
    setConsentResult(null);
    loadKyc();
    return () => {
      abortRef.current?.abort();
    };
    // loadKyc is intentionally only triggered by `token` — it's a
    // closure over the current token via the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Bug A16: bump the portal key on every transition INTO the
  // resubmission step so the portal remounts and re-fetches its
  // workspace. Catches the transition from any non-resubmission step
  // (resubmission_documents / resubmission_video / done / etc) back
  // into resubmission.
  const prevStepRef = useRef(null);
  useEffect(() => {
    if (step === "resubmission" && prevStepRef.current !== "resubmission") {
      setPortalKey((k) => k + 1);
    }
    prevStepRef.current = step;
  }, [step]);

  // Public callback for sub-flows (DocumentUploadWizard, VideoDeclarationScreen,
  // ResubmissionPortal) so they can notify the parent when the master
  // state changes. Without this, `data.kyc` stays stale after a
  // successful document/video submit and the parent's `deriveStep`
  // can pick the wrong branch on re-render.
  const refreshKyc = useCallback(() => loadKyc({ silent: true }), [
    token
  ]);

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
    // Bug A6: `onBack` deliberately omitted. There is no meaningful
    // "back" target from the resubmission portal — clicking back used
    // to take the buyer to the Welcome details screen where they
    // could re-walk the entire flow and reach the locked document view.
    // Bug A20: onStatusChanged keeps the parent's `data.kyc` fresh
    // after every state-changing call inside the portal.
    // Bug A16: `key` includes `portalKey` (incremented on every
    // transition into `resubmission`) so React remounts the portal
    // and its `useEffect([token])` re-fires. Without this, returning
    // from a sub-flow showed stale `nextAction` because the effect
    // didn't re-run.
    body = (
      <ResubmissionPortal
        key={`resubmission-${portalKey}`}
        token={token}
        onCorrectDocuments={() => setStep("resubmission_documents")}
        onCorrectVideo={() => setStep("resubmission_video")}
        onStatusChanged={refreshKyc}
      />
    );
  } else if (step === "resubmission_documents") {
    body = (
      <DocumentUploadWizard
        token={token}
        language={language}
        onBack={() => setStep("resubmission")}
        onResubmissionDone={() => setStep("resubmission")}
        onStatusChanged={refreshKyc}
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
        onStatusChanged={refreshKyc}
      />
    );
  } else if (step === "documents") {
    body = (
      <DocumentUploadWizard
        token={token}
        language={language}
        onBack={() => setStep("requirements")}
        onNextVideo={(coords) => {
          setLocationCoords(coords || null);
          setStep("video");
        }}
        onStatusChanged={refreshKyc}
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
        onStatusChanged={refreshKyc}
      />
    );
  } else if (step === "under_review") {
    body = narrow(<UnderReviewCard t={t} kyc={kyc} />);
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
      step={progressKeyFor(step, kyc)}
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
  useAudioGuide("1");

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
  useAudioGuide("2");

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
  useAudioGuide("8");

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

// Used when the KYC is mid-review (currentStage === "review_in_progress",
// overallStatus === "under_review"). The buyer's link is still active but
// there is nothing to do until the reviewer issues a final decision.
function UnderReviewCard({ t, kyc }) {
  return (
    <SectionCard
      title={t.underReviewTitle || "Your KYC is being reviewed"}
      actions={
        <StatusPill
          status="under_review"
          label={formatStatusLabel("under_review")}
        />
      }
    >
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Loader2 className="animate-spin" size={28} />
        </div>
        <p className="mx-auto max-w-md text-sm leading-7 text-slate-500">
          {t.underReviewText ||
            "Your documents and video declaration have been submitted and are now being reviewed. We'll email you as soon as a decision is made."}
        </p>
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Current stage
          </p>
          <p className="mt-1.5 text-sm font-semibold text-navy">
            {kyc?.currentStage?.replaceAll("_", " ") || "under review"}
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
