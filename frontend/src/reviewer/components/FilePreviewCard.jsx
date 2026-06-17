import { ExternalLink, FileText, Image as ImageIcon } from "lucide-react";
import { reviewerMediaUrl } from "../../api/kycApi";
import ReviewerBadge from "./ReviewerBadge";

function isImage(mimeType = "") {
  return mimeType.startsWith("image/");
}

function isPdf(mimeType = "") {
  return mimeType === "application/pdf";
}

export default function FilePreviewCard({ file }) {
  const url = reviewerMediaUrl(file.fileUrl);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
            {isImage(file.mimeType) ? (
              <ImageIcon size={18} />
            ) : (
              <FileText size={18} />
            )}
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-navy">
              {file.originalName}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {file.fileSlot} • v{file.version} •{" "}
              {file.isCurrent ? "current" : "old version"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ReviewerBadge
            status={file.isCurrent ? "accepted" : "draft_saved"}
            label={file.isCurrent ? "Current" : "Old"}
          />

          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
          >
            <ExternalLink size={16} />
          </a>
        </div>
      </div>

      {isImage(file.mimeType) && (
        <div className="bg-slate-50 p-3">
          <div className="flex max-h-[420px] items-center justify-center overflow-hidden rounded-xl bg-white">
            <img
              src={url}
              alt={file.originalName}
              className="max-h-[420px] w-full object-contain"
              loading="lazy"
            />
          </div>
        </div>
      )}

      {isPdf(file.mimeType) && (
        <div className="bg-slate-50 p-3">
          <iframe
            src={url}
            title={file.originalName}
            className="h-[360px] w-full rounded-xl border border-slate-100 bg-white"
          />
        </div>
      )}

      {!isImage(file.mimeType) && !isPdf(file.mimeType) && (
        <div className="bg-slate-50 p-6 text-sm text-slate-500">
          Preview not available. Open file in a new tab.
        </div>
      )}
    </div>
  );
}
