import { useState } from "react";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";

export default function ReviewDecisionBox({
  title = "Review action",
  acceptLabel = "Accept",
  resubmitLabel = "Ask resubmission",
  onSubmit,
  disabled = false
}) {
  const [mode, setMode] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submitDecision(decision, customRemarks = "") {
    try {
      setIsSubmitting(true);
      setMessage("");
      setError("");

      const result = await onSubmit({
        decision,
        remarks: customRemarks
      });

      if (!result.success) {
        setError(result.message || "Review action failed.");
        return;
      }

      setMessage(result.message || "Review action saved.");
      setMode(null);
      setRemarks("");
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Unable to save review action. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
      <p className="text-sm font-semibold text-gray-950">{title}</p>

      <p className="mt-1 text-xs leading-5 text-gray-500">
        Accept saves instantly. Resubmission requires a clear correction note.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => submitDecision("accepted", "Accepted.")}
          disabled={disabled || isSubmitting}
          className="flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-100 transition active:scale-[0.98] hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
        >
          {isSubmitting && mode !== "resubmission" ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <CheckCircle2 size={16} />
          )}
          {acceptLabel}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode((prev) =>
              prev === "resubmission" ? null : "resubmission"
            );
            setMessage("");
            setError("");
          }}
          disabled={disabled || isSubmitting}
          className={`flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
            mode === "resubmission"
              ? "bg-orange-600 text-white shadow-lg shadow-orange-100"
              : "border border-orange-200 bg-white text-orange-700 hover:bg-orange-50"
          }`}
        >
          <RotateCcw size={16} />
          {resubmitLabel}
        </button>
      </div>

      {mode === "resubmission" && (
        <div className="mt-4 rounded-2xl border border-orange-100 bg-white p-4">
          <label className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600">
            Resubmission reason
          </label>

          <textarea
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            disabled={disabled || isSubmitting}
            rows={3}
            placeholder="Example: Document is blurry. Please upload a clearer image."
            className="mt-2 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-gray-400 focus:bg-white disabled:opacity-60"
          />

          <button
            type="button"
            onClick={() =>
              submitDecision("resubmission_required", remarks)
            }
            disabled={disabled || isSubmitting || remarks.trim().length < 3}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-100 transition active:scale-[0.98] hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none sm:w-auto"
          >
            {isSubmitting && <Loader2 className="animate-spin" size={16} />}
            Save resubmission request
          </button>
        </div>
      )}

      {message && (
        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {message}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
