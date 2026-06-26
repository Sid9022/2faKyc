import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Copy,
  FileSearch,
  LayoutDashboard,
  Loader2,
  PlusCircle
} from "lucide-react";
import { createManualKyc, getCurrentUser } from "../../api/kycApi";
import StaffLayout from "../../components/layout/StaffLayout";

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function validateManualKycForm(data) {
  const errors = {};

  const purchaseId = (data.purchaseId || "").trim();
  if (purchaseId.length < 3) {
    errors.purchaseId = "Purchase ID must be at least 3 characters.";
  }

  const buyerName = (data.buyerName || "").trim();
  if (buyerName.length < 2) {
    errors.buyerName = "Buyer name must be at least 2 characters.";
  }

  const buyerEmail = (data.buyerEmail || "").trim();
  if (!buyerEmail) {
    errors.buyerEmail = "Email is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
    errors.buyerEmail = "Enter a valid email address.";
  }

  const pan = (data.pan || "").trim();
  if (pan.length < 10) {
    errors.pan = "PAN must be 10 characters.";
  } else if (!PAN_REGEX.test(pan)) {
    errors.pan = "Invalid PAN format. Expected: AAAAA9999A (e.g. ABCPE1234F)";
  }

  const amountRaw = data.amount;
  if (amountRaw === "" || amountRaw === null || amountRaw === undefined) {
    errors.amount = "Amount is required.";
  } else {
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.amount = "Amount must be greater than 0.";
    }
  }

  return errors;
}

export default function NewKycPage() {
  const isAdmin = getCurrentUser()?.role === "admin";

  const [formData, setFormData] = useState({
    purchaseId: "",
    idempotencyKey: "",
    buyerName: "",
    buyerEmail: "",
    buyerMobile: "",
    pan: "",
    serviceType: "SMS",
    amount: ""
  });

  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successResult, setSuccessResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const fieldErrors = useMemo(
    () => validateManualKycForm(formData),
    [formData]
  );

  const showError = (field) => Boolean(touched[field] && fieldErrors[field]);

  const navItems = [
    { key: "cases", label: "KYC cases", icon: FileSearch, to: "/reviewer/cases" },
    { key: "new-kyc", label: "New KYC", icon: PlusCircle, to: "/new-kyc" },
    ...(isAdmin
      ? [
          {
            key: "admin",
            label: "Admin console",
            icon: LayoutDashboard,
            to: "/admin",
            trailing: <ArrowUpRight size={14} className="text-white/40" />
          }
        ]
      : [])
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "pan" ? value.toUpperCase() : value
    }));
    setTouched((prev) => ({ ...prev, [name]: true }));
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Mark every field as touched so all client-side errors become visible.
    setTouched(
      Object.keys(formData).reduce((acc, key) => {
        acc[key] = true;
        return acc;
      }, {})
    );

    if (Object.keys(fieldErrors).length > 0) {
      setError("Please fix the highlighted fields before submitting.");
      return;
    }

    try {
      setIsSubmitting(true);

      const payload = {
        ...formData,
        amount: Number(formData.amount)
      };

      const result = await createManualKyc(payload);

      if (result.success) {
        // Bug B5: do NOT receive or display the raw buyer KYC URL.
        // It is delivered to the buyer by email; exposing it to the
        // reviewer's response (and dev tools, logs, etc.) makes it
        // capture-and-replay trivial. We only retain the opaque
        // linkId so the reviewer can correlate with sent emails.
        setSuccessResult({
          linkId: result.kycLink?.linkId,
          message: result.message
        });
      } else {
        setError(result.message || "Failed to create KYC.");
      }
    } catch (err) {
      // Normalize axios error into a friendly message; if the backend sent
      // a structured `errors` map (from zod), surface those too.
      const data = err?.response?.data;
      if (data?.errors && typeof data.errors === "object") {
        const parts = Object.entries(data.errors)
          .map(([field, msgs]) => {
            if (Array.isArray(msgs) && msgs.length > 0) {
              return `${field}: ${msgs.join(", ")}`;
            }
            return null;
          })
          .filter(Boolean);
        if (parts.length > 0) {
          setError(parts.join(" | "));
          return;
        }
      }
      setError(
        data?.message || "Something went wrong while creating the KYC."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = async () => {
    // Bug B5: the raw URL is no longer in the response. The Copy
    // button now copies the opaque linkId for correlation with the
    // sent email. If the reviewer needs to retrieve the URL out of
    // band, they should look at the sent email (which is auditable).
    if (!successResult?.linkId) return;
    const text = successResult.linkId;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.top = "-1000px";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!ok) throw new Error("execCommand copy failed");
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Copy failed:", err);
      setCopied(false);
    }
  };

  const resetForm = () => {
    setFormData({
      purchaseId: "",
      idempotencyKey: "",
      buyerName: "",
      buyerEmail: "",
      buyerMobile: "",
      pan: "",
      serviceType: "SMS",
      amount: ""
    });
    setTouched({});
    setSuccessResult(null);
    setError("");
  };

  return (
    <StaffLayout
      title="New KYC"
      subtitle="Manually create a KYC case for offline or UPI/bank transfer payments."
      active="new-kyc"
      navItems={navItems}
    >
      <div className="mx-auto max-w-2xl">
        {successResult ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
              <CheckCircle2 size={32} />
            </div>
            <h2 className="mt-4 text-xl font-bold text-navy">KYC link created</h2>
            <p className="mt-2 text-sm text-slate-500">
              The KYC link has been sent to the buyer's email automatically.
            </p>

            <div className="mx-auto mt-6 max-w-md rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Link ID (for reference)
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="truncate font-mono text-xs text-slate-700">
                  {successResult.linkId}
                </p>
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                    copied
                      ? "bg-green-600 text-white"
                      : "bg-white text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Copy size={14} />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className="mt-8">
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center justify-center rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white transition hover:bg-navy/90"
              >
                Create Another KYC
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <form onSubmit={handleSubmit} className="p-6 sm:p-8">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-semibold text-navy">
                    Purchase ID
                  </label>
                  <input
                    name="purchaseId"
                    value={formData.purchaseId}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="e.g. UTR or Transaction Ref"
                    required
                    aria-invalid={showError("purchaseId")}
                    className={inputClass(showError("purchaseId"))}
                  />
                  {showError("purchaseId") && (
                    <FieldError message={fieldErrors.purchaseId} />
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-semibold text-navy">
                    Idempotency Key (optional)
                  </label>
                  <input
                    name="idempotencyKey"
                    value={formData.idempotencyKey}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Leave empty to use Purchase ID"
                    className={inputClass(false)}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-semibold text-navy">
                    Buyer Name
                  </label>
                  <input
                    name="buyerName"
                    value={formData.buyerName}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Full name of the buyer"
                    required
                    aria-invalid={showError("buyerName")}
                    className={inputClass(showError("buyerName"))}
                  />
                  {showError("buyerName") && (
                    <FieldError message={fieldErrors.buyerName} />
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-navy">
                    Buyer Email
                  </label>
                  <input
                    name="buyerEmail"
                    type="email"
                    value={formData.buyerEmail}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Email address"
                    required
                    aria-invalid={showError("buyerEmail")}
                    className={inputClass(showError("buyerEmail"))}
                  />
                  {showError("buyerEmail") && (
                    <FieldError message={fieldErrors.buyerEmail} />
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-navy">
                    Buyer Mobile (optional)
                  </label>
                  <input
                    name="buyerMobile"
                    value={formData.buyerMobile}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="Mobile number"
                    className={inputClass(false)}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-navy">
                    PAN
                  </label>
                  <input
                    name="pan"
                    value={formData.pan}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="10-digit PAN (AAAAA9999A)"
                    maxLength={10}
                    required
                    aria-invalid={showError("pan")}
                    className={inputClass(showError("pan"))}
                  />
                  {showError("pan") && (
                    <FieldError message={fieldErrors.pan} />
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-navy">
                    Service
                  </label>
                  <select
                    name="serviceType"
                    value={formData.serviceType}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-navy focus:bg-white focus:ring-1 focus:ring-navy"
                  >
                    <option value="SMS">SMS</option>
                    <option value="RCS">RCS</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="SMS_WHATSAPP">SMS + WhatsApp</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-semibold text-navy">
                    Amount (INR)
                  </label>
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="0.00"
                    required
                    aria-invalid={showError("amount")}
                    className={inputClass(showError("amount"))}
                  />
                  {showError("amount") && (
                    <FieldError message={fieldErrors.amount} />
                  )}
                </div>
              </div>

              {error && (
                <div className="mt-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">
                  {error}
                </div>
              )}

              <div className="mt-8 border-t border-slate-100 pt-6">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy py-3.5 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isSubmitting ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : null}
                  {isSubmitting ? "Creating KYC..." : "Create KYC"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </StaffLayout>
  );
}

function inputClass(hasError) {
  return [
    "w-full rounded-xl border bg-slate-50 px-4 py-3 text-sm outline-none transition",
    "focus:bg-white focus:ring-1",
    hasError
      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
      : "border-slate-200 focus:border-navy focus:ring-navy"
  ].join(" ");
}

function FieldError({ message }) {
  return (
    <p className="mt-1.5 text-xs font-medium text-red-600">{message}</p>
  );
}
