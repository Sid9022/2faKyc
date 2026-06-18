export default function LanguageToggle({ language, onChange }) {
  return (
    <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => onChange("en")}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all sm:px-4 sm:py-2 sm:text-sm ${
          language === "en"
            ? "bg-navy text-white shadow-sm"
            : "text-slate-500 hover:text-navy"
        }`}
      >
        English
      </button>

      <button
        type="button"
        onClick={() => onChange("hi")}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all sm:px-4 sm:py-2 sm:text-sm ${
          language === "hi"
            ? "bg-navy text-white shadow-sm"
            : "text-slate-500 hover:text-navy"
        }`}
      >
        हिंदी
      </button>
    </div>
  );
}
