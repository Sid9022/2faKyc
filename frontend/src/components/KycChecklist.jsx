import {
  BadgeCheck,
  Camera,
  FileText,
  IdCard,
  Video,
  UploadCloud
} from "lucide-react";
import StatusPill from "./StatusPill";

function getIcon(inputMode, key) {
  if (inputMode === "live_video" || key.includes("video")) {
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

export default function KycChecklist({ checklist = [] }) {
  const requiredCount = checklist.filter((item) => item.required).length;
  const optionalCount = checklist.filter((item) => !item.required).length;

  return (
    <section className="rounded-[2rem] border border-gray-200/80 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-gray-950">
            Required documents
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-500">
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

      <div className="mt-6 space-y-3">
        {checklist.map((item, index) => {
          const Icon = getIcon(item.inputMode, item.key);

          return (
            <div
              key={item.id || item.key}
              className="group rounded-2xl border border-gray-100 bg-gray-50/70 p-4 transition-all hover:border-gray-200 hover:bg-white hover:shadow-sm"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-gray-700 shadow-sm ring-1 ring-gray-100">
                  <Icon size={20} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-950">
                        {index + 1}. {item.label}
                      </p>

                      <p className="mt-1 text-xs leading-5 text-gray-500">
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

                <div className="hidden text-gray-300 transition group-hover:text-emerald-500 sm:block">
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
