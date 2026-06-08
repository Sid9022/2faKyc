function getStatusClasses(status) {
  switch (status) {
    case "opened":
    case "active":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";

    case "link_sent":
    case "pending":
      return "bg-amber-50 text-amber-700 ring-amber-200";

    case "approved":
      return "bg-green-50 text-green-700 ring-green-200";

    case "rejected":
    case "expired":
      return "bg-red-50 text-red-700 ring-red-200";

    default:
      return "bg-gray-100 text-gray-700 ring-gray-200";
  }
}

export default function StatusPill({ status, label }) {
  const displayLabel = label || status || "unknown";

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${getStatusClasses(
        status
      )}`}
    >
      {displayLabel.replaceAll("_", " ")}
    </span>
  );
}
