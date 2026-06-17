/**
 * Single source of truth for status -> badge colors across the whole app
 * (admin, reviewer, and the buyer portal via StatusPill).
 *
 * Palette (design brief):
 *   link_sent / opened          -> blue
 *   in_progress / submitted     -> amber
 *   under_review                -> accent blue (indigo, distinct from link_sent)
 *   approved / accepted / active-> green
 *   rejected / expired          -> red
 *   resubmission_required       -> purple (resubmit)
 */

const STATUS_MAP = {
  // blue — link lifecycle
  link_sent: "bg-blue-50 text-blue-700 ring-blue-200",
  opened: "bg-blue-50 text-blue-700 ring-blue-200",

  // amber — buyer working / waiting in queue
  in_progress: "bg-amber-50 text-amber-700 ring-amber-200",
  submitted: "bg-amber-50 text-amber-700 ring-amber-200",
  submitted_doc: "bg-amber-50 text-amber-700 ring-amber-200",
  submitted_video: "bg-amber-50 text-amber-700 ring-amber-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",

  // accent indigo — actively being reviewed
  under_review: "bg-indigo-50 text-indigo-700 ring-indigo-200",

  // green — done / good
  approved: "bg-green-50 text-green-700 ring-green-200",
  accepted: "bg-green-50 text-green-700 ring-green-200",
  active: "bg-green-50 text-green-700 ring-green-200",
  done: "bg-green-50 text-green-700 ring-green-200",

  // red — failed / dead
  rejected: "bg-red-50 text-red-700 ring-red-200",
  expired: "bg-red-50 text-red-700 ring-red-200",

  // purple — needs the buyer to fix something
  resubmission_required: "bg-violet-50 text-violet-700 ring-violet-200",
  resubmit: "bg-violet-50 text-violet-700 ring-violet-200",

  // neutral
  draft_saved: "bg-slate-100 text-slate-600 ring-slate-200",
  not_started: "bg-slate-100 text-slate-500 ring-slate-200",
  skipped: "bg-slate-100 text-slate-500 ring-slate-200"
};

const DEFAULT_CLASSES = "bg-slate-100 text-slate-600 ring-slate-200";

export function statusClasses(status) {
  return STATUS_MAP[status] || DEFAULT_CLASSES;
}

export function formatStatusLabel(status) {
  return String(status || "unknown").replaceAll("_", " ");
}

/** Shared badge class string — combine in your own <span>. */
export function badgeClass(status, extra = "") {
  return `inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${statusClasses(
    status
  )} ${extra}`.trim();
}
