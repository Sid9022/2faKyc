import { BadgeCheck, Camera, FileText, IdCard, UploadCloud, Video } from "lucide-react";
import StatusPill from "./StatusPill";

function getIcon(inputMode, key) {
  if (inputMode === "live_video" || key?.includes("video")) {
    return Video;
  }
  if (inputMode?.includes("live_photo")) {
    return Camera;
  }
  if (key?.includes("pan")) {
    return IdCard;
  }
  if (inputMode?.includes("upload")) {
    return UploadCloud;
  }
  return FileText;
}

function getInputLabel(inputMode) {
  const map = {
    upload: "Upload file",
    live_photo_front: "Live photo",
    live_photo_front_back: "Front and back photo",
    upload_or_live_photo: "Upload or live photo",
    live_video: "Live video"
  };
  return map[inputMode] || "Required input";
}

/**
 * Required-documents list.
 * When `embedded` is true the component renders body-only — used inside a
 * `SectionCard` whose own title/subtitle sits above this list.
 */
export default function KycChecklist({ checklist = [], embedded = false }) {
  const requiredCount = checklist.filter((item) => item.required).length;
  const optionalCount = checklist.filter((item) => !item.required).length;

  const header = !embedded ? (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-navy">
          Required documents
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Keep these ready before starting. You will only upload what applies
          to your entity type.
        </p>
      </div>

      <div className="flex gap-2">
        <StatusPill status="pending" label={`${requiredCount} required`} />
        {optionalCount > 0 && (
          <StatusPill status="default" label={`${optionalCount} optional`} />
        )}
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap gap-2">
      <StatusPill status="pending" label={`${requiredCount} required`} />
      {optionalCount > 0 && (
        <StatusPill status="default" label={`${optionalCount} optional`} />
      )}
    </div>
  );

  return (
    <section
      className={
        embedded
          ? "space-y-3"
          : "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      }
    >
      {!embedded ? header : null}

      <div className={embedded ? "mt-3 space-y-3" : "mt-6 space-y-3"}>
        {checklist.map((item, index) => {
          const Icon = getIcon(item.inputMode, item.key);

          return (
            <div
              key={item.id || item.key}
              className="group rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white hover:shadow-sm"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-navy shadow-sm ring-1 ring-slate-200">
                  <Icon size={18} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy">
                        {index + 1}. {item.label}
                      </p>

                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {getInputLabel(item.inputMode)}
                        {item.needsFront && item.needsBack
                          ? " • Front and back required"
                          : item.needsFront
                            ? " • Front side required"
                            : ""}
                        {item.ocrEnabled ? " • Auto-check enabled" : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {item.required ? (
                        <StatusPill status="pending" label="Required" />
                      ) : (
                        <StatusPill status="default" label="Optional" />
                      )}
                    </div>
                  </div>
                </div>

                <div className="hidden text-slate-300 transition group-hover:text-emerald-500 sm:block">
                  <BadgeCheck size={18} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}