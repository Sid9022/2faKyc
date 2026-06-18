import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  ImagePlus,
  Loader2,
  LockKeyhole,
  RefreshCcw,
  Send,
  ShieldCheck,
  UploadCloud,
  Video
} from "lucide-react";

import {
  API_BASE_URL,
  finalSubmitKycDocuments,
  getKycDocuments,
  saveKycDocument,
  saveKycDocumentProgress
} from "../api/kycApi";
import StatusPill from "./StatusPill";

const content = {
  en: {
    title: "Upload your documents one by one.",
    subtitle:
      "Your progress is saved after every Next click. You can edit any document until final submission.",
    saved: "Saved",
    pending: "Pending",
    optional: "Optional",
    required: "Required",
    chooseFile: "Choose file",
    replaceFile: "Replace file",
    notes: "Add note for reviewer, optional",
    back: "Back",
    saveNext: "Save and next",
    saving: "Saving...",
    skip: "Skip optional",
    finalSubmit: "Final submit documents",
    finalSubmitting: "Submitting...",
    edit: "Edit",
    lockedTitle: "Documents submitted successfully",
    lockedText:
      "Your documents are now locked for review. If the reviewer needs changes, only the failed item will reopen.",
    reload: "Reload progress"
  },
  hi: {
    title: "अपने documents एक-एक करके upload करें।",
    subtitle:
      "हर Next click पर progress save होगी। Final submission से पहले आप documents edit कर सकते हैं।",
    saved: "Saved",
    pending: "Pending",
    optional: "Optional",
    required: "Required",
    chooseFile: "File choose करें",
    replaceFile: "File replace करें",
    notes: "Reviewer के लिए note, optional",
    back: "Back",
    saveNext: "Save करके next",
    saving: "Save हो रहा है...",
    skip: "Optional skip करें",
    finalSubmit: "Documents final submit करें",
    finalSubmitting: "Submit हो रहा है...",
    edit: "Edit",
    lockedTitle: "Documents successfully submit हो गए",
    lockedText:
      "अब documents review के लिए locked हैं। Reviewer को changes चाहिए होंगे तो सिर्फ failed item reopen होगा।",
    reload: "Progress reload करें"
  }
};

function getSlots(step) {
  if (!step) return [];

  if (step.inputMode === "live_photo_front_back") {
    return [
      {
        name: "front",
        label: "Front side",
        accept: "image/*",
        capture: "environment"
      },
      {
        name: "back",
        label: "Back side",
        accept: "image/*",
        capture: "environment"
      }
    ];
  }

  if (step.inputMode === "live_photo_front") {
    return [
      {
        name: "front",
        label: "Live photo / front side",
        accept: "image/*",
        capture: "environment"
      }
    ];
  }

  return [
    {
      name: "document",
      label:
        step.inputMode === "upload_or_live_photo"
          ? "Upload file or photo"
          : "Upload file",
      accept: "image/*,.pdf"
    }
  ];
}

function isStepSaved(step) {
  return ["draft_saved", "skipped", "submitted", "accepted"].includes(step?.status);
}

function hasNewSelectedFiles(selectedFiles = {}) {
  return Object.values(selectedFiles).some(Boolean);
}

function getSaveButtonLabel({ activeStep, selectedFiles, t }) {
  const hasNewFiles = hasNewSelectedFiles(selectedFiles);

  if (isStepSaved(activeStep) && !hasNewFiles) {
    return "Next";
  }

  if (isStepSaved(activeStep) && hasNewFiles) {
    return "Update and next";
  }

  return t.saveNext;
}

export default function DocumentUploadWizard({
  token,
  language = "en",
  onBack,
  onNextVideo,
  onResubmissionDone
}) {
  const t = content[language] || content.en;

  const [workspace, setWorkspace] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const [selectedFiles, setSelectedFiles] = useState({});
  const [notes, setNotes] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinalSubmitting, setIsFinalSubmitting] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const steps = workspace?.steps || [];
  const progress = workspace?.progress;
  const activeStep = steps[activeIndex];

  const isLocked = progress?.isFinalSubmitted;
  const isResubmissionMode = workspace?.kyc?.isResubmissionMode;

  const savedRequiredCount = useMemo(() => {
    return steps.filter((step) => step.isRequired && isStepSaved(step)).length;
  }, [steps]);

  const requiredCount = useMemo(() => {
    return steps.filter((step) => step.isRequired).length;
  }, [steps]);

  const canFinalSubmit = useMemo(() => {
    return requiredCount > 0 && savedRequiredCount === requiredCount && !isLocked;
  }, [requiredCount, savedRequiredCount, isLocked]);

  async function loadWorkspace() {
    try {
      setIsLoading(true);
      setError("");

      const result = await getKycDocuments(token);

      if (!result.success) {
        setError(result.message || "Unable to load documents.");
        return;
      }

      setWorkspace(result);

      const resumeIndex = result.progress?.currentStepIndex || 0;
      setActiveIndex(Math.min(resumeIndex, (result.steps || []).length - 1));
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Unable to load document progress. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    setSelectedFiles({});
    setNotes(activeStep?.notes || "");
    setSuccess("");
    setError("");
  }, [activeIndex, activeStep?.requirementId]);

  async function goToStep(index) {
    if (index < 0 || index >= steps.length) return;

    setActiveIndex(index);

    try {
      await saveKycDocumentProgress(token, index);
    } catch {
      // UI should not break if progress log fails.
    }
  }

  function handleFileChange(slot, file) {
    setSelectedFiles((prev) => ({
      ...prev,
      [slot]: file
    }));
  }

  function hasRequiredSelectedFiles() {
    const slots = getSlots(activeStep);

    if (!activeStep?.isRequired) {
      return Object.values(selectedFiles).some(Boolean) || isStepSaved(activeStep);
    }

    return slots.every((slot) => {
      const alreadyUploaded = activeStep?.currentFiles?.some(
        (file) => file.fileSlot === slot.name
      );

      return selectedFiles[slot.name] || alreadyUploaded;
    });
  }

  async function handleSaveAndNext() {
    if (!activeStep || isLocked) return;

    if (!hasRequiredSelectedFiles()) {
      setError("Please select the required file(s) before moving next.");
      return;
    }

    try {
      setIsSaving(true);
      setError("");
      setSuccess("");

      const formData = new FormData();
      formData.append("notes", notes || "");

      let hasNewFiles = false;
      Object.entries(selectedFiles).forEach(([slot, file]) => {
        if (file) {
          formData.append(slot, file);
          hasNewFiles = true;
        }
      });

      // If no new files but notes updated or it was already saved, we can just save notes
      if (!hasNewFiles && isStepSaved(activeStep)) {
        // Just let it proceed or save with notes
      }

      const result = await saveKycDocument(
        token,
        activeStep.requirementId,
        formData
      );

      if (!result.success) {
        setError(result.message || "Unable to save document.");
        return;
      }

      setWorkspace(result);
      setSuccess(
        isStepSaved(activeStep) && !hasNewSelectedFiles(selectedFiles)
          ? `Continuing from saved ${activeStep.documentName}.`
          : `${activeStep.documentName} saved successfully.`
      );

      const nextIndex = Math.min(activeIndex + 1, steps.length - 1);
      setActiveIndex(nextIndex);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Unable to save document. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSkipOptional() {
    if (!activeStep || activeStep.isRequired || isLocked) return;

    try {
      setIsSaving(true);
      setError("");
      setSuccess("");

      const formData = new FormData();
      formData.append("skipOptional", "true");
      formData.append("notes", notes || "");

      const result = await saveKycDocument(
        token,
        activeStep.requirementId,
        formData
      );

      if (!result.success) {
        setError(result.message || "Unable to skip optional document.");
        return;
      }

      setWorkspace(result);
      setSuccess(`${activeStep.documentName} skipped.`);

      const nextIndex = Math.min(activeIndex + 1, steps.length - 1);
      setActiveIndex(nextIndex);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Unable to skip optional document. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleFinalSubmit() {
    try {
      setIsFinalSubmitting(true);
      setError("");
      setSuccess("");

      const result = await finalSubmitKycDocuments(token);

      if (!result.success) {
        setError(result.message || "Unable to final submit documents.");
        return;
      }

      await loadWorkspace();
      setSuccess("Documents final submitted successfully.");
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Unable to final submit documents. Please try again."
      );
    } finally {
      setIsFinalSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/80 bg-white/90 p-8 shadow-xl shadow-gray-200/70">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="animate-spin" size={20} />
          Loading saved document progress...
        </div>
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div className="rounded-2xl border border-red-100 bg-white p-8 shadow-xl shadow-red-100/60">
        <p className="text-lg font-semibold text-navy">
          Unable to load documents
        </p>
        <p className="mt-2 text-sm leading-6 text-red-600">{error}</p>

        <button
          type="button"
          onClick={loadWorkspace}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-gray-950 px-5 py-3 text-sm font-semibold text-white"
        >
          <RefreshCcw size={16} />
          {t.reload}
        </button>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-white/90 p-8 shadow-xl shadow-emerald-100/60">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <CheckCircle2 size={28} />
        </div>

        <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em] text-navy">
          {isResubmissionMode
            ? "Corrected documents submitted"
            : t.lockedTitle}
        </h1>

        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
          {isResubmissionMode
            ? "Your corrected document has been submitted for review. Accepted items remain locked."
            : t.lockedText}
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Final submitted at
          </p>
          <p className="mt-2 text-sm font-semibold text-navy">
            {formatDateTime(progress?.finalSubmittedAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {isResubmissionMode ? (
            <button
              type="button"
              onClick={onResubmissionDone}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-black"
            >
              Back to correction summary
            </button>
          ) : (
            <button
              type="button"
              onClick={onNextVideo}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-black"
            >
              <Video size={16} />
              Continue to video declaration
            </button>
          )}

          <button
            type="button"
            onClick={onBack}
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            {t.back}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28 sm:pb-0">
      {isSaving && (
        <UploadLoadingOverlay
          documentName={activeStep?.documentName}
          language={language}
        />
      )}
      {/* Mobile: compact header — chips + step progress only */}
      <div className="flex flex-wrap items-center gap-2 sm:hidden">
        <StatusPill status="active" label={`${savedRequiredCount}/${requiredCount} saved`} />
        <StatusPill status="pending" label={`Step ${activeIndex + 1}/${steps.length}`} />
      </div>

      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        <StatusPill status="active" label={`${savedRequiredCount}/${requiredCount} required saved`} />
        <StatusPill status="pending" label={`Step ${activeIndex + 1}/${steps.length}`} />
      </div>

      <h1 className="mt-7 hidden text-2xl font-bold tracking-tight text-navy sm:block sm:text-3xl">
        {t.title}
      </h1>

      <p className="mt-4 hidden max-w-2xl text-sm leading-7 text-slate-500 sm:block">
        {t.subtitle}
      </p>

      {/* Mobile: horizontal scrollable step chips — replaces the side panel */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:hidden">
        {steps.map((step, index) => {
          const saved = isStepSaved(step);
          const isActive = activeIndex === index;
          return (
            <button
              key={step.requirementId}
              type="button"
              onClick={() => goToStep(index)}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? "border-navy bg-navy text-white shadow-sm"
                  : saved
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {saved && !isActive ? (
                <CheckCircle2 size={12} />
              ) : (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
                  {index + 1}
                </span>
              )}
              <span className="max-w-[140px] truncate">{step.documentName}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
        <aside className="hidden rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:block">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Document steps
          </p>

          <div className="space-y-2">
            {steps.map((step, index) => (
              <button
                key={step.requirementId}
                type="button"
                onClick={() => goToStep(index)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                  activeIndex === index
                    ? "border-gray-950 bg-white shadow-sm"
                    : "border-transparent bg-transparent hover:bg-white"
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isStepSaved(step)
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-gray-200 text-slate-600"
                  }`}
                >
                  {isStepSaved(step) ? <CheckCircle2 size={16} /> : index + 1}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-navy">
                    {step.documentName}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {step.isRequired ? t.required : t.optional} •{" "}
                    {step.status.replaceAll("_", " ")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          {activeStep && (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 sm:block">
                    Current document
                  </p>

                  <h2 className="mt-2 text-lg font-semibold tracking-tight text-navy sm:text-xl">
                    {activeStep.documentName}
                  </h2>

                  <p className="mt-2 hidden text-sm leading-6 text-slate-500 sm:block">
                    {getInputHelp(activeStep)}
                  </p>
                </div>

                <StatusPill
                  status={isStepSaved(activeStep) ? "active" : "pending"}
                  label={
                    isStepSaved(activeStep)
                      ? t.saved
                      : activeStep.isRequired
                        ? t.required
                        : t.optional
                  }
                />
              </div>

              <div className="mt-6 space-y-4">
                {getSlots(activeStep).map((slot) => (
                  <FileInputCard
                    key={slot.name}
                    slot={slot}
                    selectedFile={selectedFiles[slot.name]}
                    currentFile={activeStep.currentFiles?.find(
                      (file) => file.fileSlot === slot.name
                    )}
                    onChange={(file) => handleFileChange(slot.name, file)}
                    replaceLabel={t.replaceFile}
                    chooseLabel={t.chooseFile}
                  />
                ))}
              </div>

              <div className="mt-4 hidden sm:block">
                <label className="text-sm font-semibold text-navy">
                  {t.notes}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t.notes}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm focus:border-gray-950 focus:outline-none"
                  rows={3}
                />
              </div>

              <details className="mt-4 sm:hidden">
                <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-navy">
                  + Add notes (optional)
                </summary>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t.notes}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm focus:border-gray-950 focus:outline-none"
                  rows={2}
                />
              </details>

              {error && (
                <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700 sm:p-4">
                  {error}
                </div>
              )}

              {success && (
                <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/75 p-3 text-sm font-medium text-emerald-800 sm:p-4">
                  {success}
                </div>
              )}

              {/* Mobile: sticky bottom action bar with primary CTA */}
              <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md sm:hidden"
                style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
              >
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onBack}
                    disabled={isSaving || isFinalSubmitting}
                    className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
                  >
                    <ArrowLeft size={16} />
                  </button>

                  {!activeStep.isRequired && (
                    <button
                      type="button"
                      onClick={handleSkipOptional}
                      disabled={isSaving || isFinalSubmitting}
                      className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
                    >
                      {t.skip}
                    </button>
                  )}

                  {canFinalSubmit ? (
                    <button
                      type="button"
                      onClick={handleFinalSubmit}
                      disabled={isSaving || isFinalSubmitting}
                      className="inline-flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                    >
                      {isFinalSubmitting ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          {t.finalSubmitting}
                        </>
                      ) : (
                        <>
                          <Send size={16} />
                          {t.finalSubmit}
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSaveAndNext}
                      disabled={isSaving || isFinalSubmitting}
                      className="inline-flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-navy px-3 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          {t.saving}
                        </>
                      ) : (
                        <>
                          {getSaveButtonLabel({ activeStep, selectedFiles, t })}
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Desktop: inline action bar */}
              <div className="mt-6 hidden flex-wrap gap-3 sm:flex">
                <button
                  type="button"
                  onClick={handleSaveAndNext}
                  disabled={isSaving || isFinalSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-950 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-black disabled:bg-gray-300 disabled:shadow-none"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="animate-spin" size={17} />
                      {t.saving}
                    </>
                  ) : (
                    <>
                      {getSaveButtonLabel({ activeStep, selectedFiles, t })}
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>

                {!activeStep.isRequired && (
                  <button
                    type="button"
                    onClick={handleSkipOptional}
                    disabled={isSaving || isFinalSubmitting}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    {t.skip}
                  </button>
                )}

                {canFinalSubmit && (
                  <button
                    type="button"
                    onClick={handleFinalSubmit}
                    disabled={isSaving || isFinalSubmitting}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700 disabled:bg-gray-300"
                  >
                    {isFinalSubmitting ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        {t.finalSubmitting}
                      </>
                    ) : (
                      <>
                        <Send size={16} />
                        {t.finalSubmit}
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={onBack}
                  disabled={isSaving || isFinalSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <ArrowLeft size={16} />
                  {t.back}
                </button>
              </div>

              {!canFinalSubmit ? (
                <p className="mt-3 hidden text-xs leading-5 text-slate-500 sm:block">
                  Complete all required documents to enable final submission.
                </p>
              ) : (
                <p className="mt-3 hidden text-xs leading-5 text-slate-500 sm:block">
                  Final submit will lock editing. Review your saved files before submitting.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function FileInputCard({
  slot,
  selectedFile,
  currentFile,
  onChange,
  chooseLabel,
  replaceLabel
}) {
  const hasSavedFile = Boolean(currentFile);
  const hasSelectedFile = Boolean(selectedFile);

  const buttonLabel = hasSelectedFile
    ? "Change selected"
    : hasSavedFile
      ? replaceLabel
      : chooseLabel;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:rounded-2xl sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm sm:h-11 sm:w-11 sm:rounded-2xl ${
              hasSavedFile
                ? "bg-emerald-50 text-emerald-600"
                : "bg-white text-slate-700"
            }`}
          >
            {hasSavedFile ? (
              <CheckCircle2 size={18} className="sm:h-5 sm:w-5" />
            ) : slot.accept?.includes("image") ? (
              <ImagePlus size={18} className="sm:h-5 sm:w-5" />
            ) : (
              <FileText size={18} className="sm:h-5 sm:w-5" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-navy">
                {slot.label}
              </p>

              {hasSavedFile && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                  Saved
                </span>
              )}

              {hasSelectedFile && (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100">
                  Ready
                </span>
              )}
            </div>

            <p className="mt-1 hidden text-xs leading-5 text-slate-500 sm:block">
              JPG, PNG, WEBP, or PDF. Max 10 MB.
            </p>

            {currentFile && (
              <div className="mt-3 rounded-xl border border-emerald-100 bg-white px-3 py-2 w-full">
                <p className="text-xs font-semibold text-slate-500">
                  Current saved file
                </p>

                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <a
                    href={`${API_BASE_URL}${currentFile.fileUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 shrink-0"
                  >
                    View file
                  </a>

                  <span className="truncate text-xs text-slate-700 flex-1 min-w-0" title={currentFile.originalName}>
                    {currentFile.originalName}
                  </span>

                  <span className="text-xs text-slate-400 shrink-0">
                    v{currentFile.version}
                  </span>
                </div>
              </div>
            )}

            {selectedFile && (
              <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 w-full">
                <p className="text-xs font-semibold text-blue-700">
                  New file selected, not uploaded yet
                </p>

                <p className="mt-1 truncate text-xs text-blue-900" title={selectedFile.name}>
                  {selectedFile.name}
                </p>

                <p className="mt-1 text-xs text-blue-600">
                  Click Save and next to upload this file.
                </p>
              </div>
            )}
          </div>
        </div>

        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50 shrink-0">
          <UploadCloud size={16} />
          {buttonLabel}
          <input
            type="file"
            accept={slot.accept}
            capture={slot.capture}
            onChange={(event) => onChange(event.target.files?.[0] || null)}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
}

function getInputHelp(step) {
  if (step.inputMode === "live_photo_front_back") {
    return "Please upload/capture front and back side photos.";
  }
  if (step.inputMode === "live_photo_front") {
    return "Please upload/capture the front photo.";
  }
  return "Please upload a clear scanned PDF or image copy of the document.";
}

function formatDateTime(dateString) {
  if (!dateString) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(dateString));
}

function UploadLoadingOverlay({ documentName, language }) {
  const [msgIndex, setMsgIndex] = useState(0);

  const messages = useMemo(() => {
    if (language === "hi") {
      return [
        "दस्तावेज़ अपलोड हो रहा है...",
        "सत्यापन प्रक्रिया चल रही है (OCR)...",
        "धुंधलेपन और रोशनी की जांच हो रही है...",
        "गोपनीयता और डेटा सुरक्षित कर रहे हैं...",
        "बस कुछ ही पल और..."
      ];
    }
    return [
      "Uploading secure document packets...",
      "Analyzing document structure via OCR...",
      "Verifying security and authenticity...",
      "Encrypting details for reviewer console...",
      "Almost done, wrapping up validation..."
    ];
  }, [language]);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % messages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 backdrop-blur-md p-4 animate-fade-in">
      <div className="w-full max-w-md rounded-3xl border border-white/20 bg-slate-900/95 p-8 text-center text-white shadow-2xl backdrop-blur-xl">
        {/* Scanning Animation Visual */}
        <div className="relative mx-auto mb-6 flex h-24 w-40 items-center justify-center rounded-2xl border border-white/10 bg-white/5 overflow-hidden shadow-inner">
          <FileText size={40} className="text-white/40 animate-pulse" />
          
          {/* Neon scan line */}
          <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent shadow-[0_0_12px_#3b82f6] animate-scan" />
          
          <div className="absolute top-2 right-2 rounded-full bg-accent/20 p-1 text-accent animate-pulse">
            <ShieldCheck size={12} />
          </div>
        </div>

        <h3 className="text-lg font-bold tracking-tight text-white flex items-center justify-center gap-2.5">
          <Loader2 className="animate-spin text-accent" size={18} />
          {language === "hi" ? `सत्यापित कर रहे हैं: ${documentName}` : `Validating: ${documentName}`}
        </h3>

        <div className="mt-4 h-6 flex items-center justify-center">
          <p className="text-sm font-semibold text-slate-300 animate-pulse transition-all duration-300">
            {messages[msgIndex]}
          </p>
        </div>

        <div className="mx-auto mt-6 h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-accent origin-left animate-loading-bar rounded-full" />
        </div>
      </div>
    </div>
  );
}
