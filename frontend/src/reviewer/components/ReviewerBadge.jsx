import { statusClasses, formatStatusLabel } from "../../components/statusStyles";

export default function ReviewerBadge({ status, label }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold capitalize ring-1 ring-inset ${statusClasses(
        status
      )}`}
    >
      {label ? String(label).replaceAll("_", " ") : formatStatusLabel(status)}
    </span>
  );
}
