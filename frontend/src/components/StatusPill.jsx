import { statusClasses, formatStatusLabel } from "./statusStyles";

export default function StatusPill({ status, label }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${statusClasses(
        status
      )}`}
    >
      {label ? label.replaceAll("_", " ") : formatStatusLabel(status)}
    </span>
  );
}
