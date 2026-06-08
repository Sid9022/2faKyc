import { AlertTriangle, RefreshCcw } from "lucide-react";

export default function ErrorState({ title, message, onRetry }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-lg rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-xl shadow-red-100/60">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <AlertTriangle size={26} />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-gray-950">
          {title || "Unable to open KYC link"}
        </h1>

        <p className="mt-3 text-sm leading-6 text-gray-500">
          {message ||
            "This link may be invalid, expired, or no longer active. Please contact support if you believe this is a mistake."}
        </p>

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-gray-300 transition hover:-translate-y-0.5 hover:bg-black"
          >
            <RefreshCcw size={16} />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
