import { useState } from "react";
import { Link } from "react-router-dom";
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successResult, setSuccessResult] = useState(null);
  const [copied, setCopied] = useState(false);

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
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const payload = {
        ...formData,
        amount: formData.amount ? parseFloat(formData.amount) : undefined
      };

      const result = await createManualKyc(payload);

      if (result.success) {
        setSuccessResult({
          linkId: result.kycLink.linkId,
          buyerKycUrl: result.kycLink.buyerKycUrl,
          message: result.message
        });
      } else {
        setError(result.message || "Failed to create KYC.");
      }
    } catch (err) {
      setError(
        err?.response?.data?.message || "Something went wrong while creating the KYC."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = () => {
    if (!successResult) return;
    navigator.clipboard.writeText(successResult.buyerKycUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
                Generated Link
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium text-slate-700">
                  {successResult.buyerKycUrl}
                </p>
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-100"
                >
                  <Copy size={14} />
                  {copied ? "Copied!" : "Copy"}
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
                    placeholder="e.g. UTR or Transaction Ref"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-navy focus:bg-white focus:ring-1 focus:ring-navy"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-semibold text-navy">
                    Idempotency Key (optional)
                  </label>
                  <input
                    name="idempotencyKey"
                    value={formData.idempotencyKey}
                    onChange={handleChange}
                    placeholder="Leave empty to use Purchase ID"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-navy focus:bg-white focus:ring-1 focus:ring-navy"
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
                    placeholder="Full name of the buyer"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-navy focus:bg-white focus:ring-1 focus:ring-navy"
                  />
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
                    placeholder="Email address"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-navy focus:bg-white focus:ring-1 focus:ring-navy"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-navy">
                    Buyer Mobile (optional)
                  </label>
                  <input
                    name="buyerMobile"
                    value={formData.buyerMobile}
                    onChange={handleChange}
                    placeholder="Mobile number"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-navy focus:bg-white focus:ring-1 focus:ring-navy"
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
                    placeholder="10-digit PAN"
                    maxLength={10}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm uppercase outline-none transition focus:border-navy focus:bg-white focus:ring-1 focus:ring-navy"
                  />
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
                    placeholder="0.00"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-navy focus:bg-white focus:ring-1 focus:ring-navy"
                  />
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
