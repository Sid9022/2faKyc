function getClasses(status) {
  switch (status) {
    case "submitted":
      return "bg-blue-50 text-blue-700 ring-blue-100";

    case "under_review":
      return "bg-amber-50 text-amber-700 ring-amber-100";

    case "approved":
    case "accepted":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";

    case "rejected":
      return "bg-red-50 text-red-700 ring-red-100";

    case "resubmission_required":
      return "bg-orange-50 text-orange-700 ring-orange-100";

    case "draft_saved":
    case "submitted_doc":
    case "submitted_video":
      return "bg-gray-100 text-gray-700 ring-gray-200";

    default:
      return "bg-gray-100 text-gray-700 ring-gray-200";
  }
}

export default function ReviewerBadge({ status, label }) {
  const text = label || status || "unknown";

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold capitalize ring-1 ring-inset ${getClasses(
        status
      )}`}
    >
      {String(text).replaceAll("_", " ")}
    </span>
  );
}
