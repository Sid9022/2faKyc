export default function LanguageToggle({ language, onChange }) {
  return (
    <div className="inline-flex rounded-full border border-gray-200 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => onChange("en")}
        className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
          language === "en"
            ? "bg-gray-950 text-white shadow-sm"
            : "text-gray-500 hover:text-gray-950"
        }`}
      >
        English
      </button>

      <button
        type="button"
        onClick={() => onChange("hi")}
        className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
          language === "hi"
            ? "bg-gray-950 text-white shadow-sm"
            : "text-gray-500 hover:text-gray-950"
        }`}
      >
        हिंदी
      </button>
    </div>
  );
}
