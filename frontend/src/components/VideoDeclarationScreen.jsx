import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  CircleStop,
  FileVideo,
  Loader2,
  MapPin,
  Mic,
  RefreshCcw,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Video,
  Volume2
} from "lucide-react";
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import SectionCard from "./ui/SectionCard";
import { formatStatusLabel } from "./statusStyles";
import useAudioGuide from "../hooks/useAudioGuide";

import {
  API_BASE_URL,
  getKycVideoWorkspace,
  startKycVideoDeclaration,
  uploadKycVideoDeclaration
} from "../api/kycApi";
import StatusPill from "./StatusPill";

const content = {
  en: {
    title: "Complete your live video declaration.",
    subtitle:
      "Read the declaration clearly on camera. Keep your face centered and visible during recording.",
    detailsTitle: "Authorized person details",
    fullName: "Authorized person full name",
    role: "Role / designation, optional",
    businessName: "Business legal name",
    generate: "Generate declaration script",
    generating: "Generating script...",
    cameraTitle: "Camera readiness check",
    startCamera: "Start camera check",
    startRecording: "Start recording",
    stopRecording: "Stop recording",
    retake: "Retake",
    submit: "Submit video declaration",
    submitting: "Submitting video...",
    preview: "Preview recording",
    completedTitle: "KYC submitted successfully",
    completedText:
      "Your documents and video declaration are submitted for review. If changes are needed, only the failed item will reopen.",
    back: "Back"
  },
  hi: {
    title: "अपना live video declaration complete करें।",
    subtitle:
      "Camera पर declaration clearly पढ़ें। Recording के दौरान face centered और visible रखें।",
    detailsTitle: "Authorized person details",
    fullName: "Authorized person full name",
    role: "Role / designation, optional",
    businessName: "Business legal name",
    generate: "Declaration script generate करें",
    generating: "Script generate हो रहा है...",
    cameraTitle: "Camera readiness check",
    startCamera: "Camera check start करें",
    startRecording: "Recording start करें",
    stopRecording: "Recording stop करें",
    retake: "Retake",
    submit: "Video declaration submit करें",
    submitting: "Video submit हो रहा है...",
    preview: "Recording preview",
    completedTitle: "KYC successfully submit हो गया",
    completedText:
      "आपके documents और video declaration review के लिए submit हो गए हैं। Changes चाहिए होंगे तो सिर्फ failed item reopen होगा।",
    back: "Back"
  }
};

const PERMISSION_GATE_TEXT = {
  en: {
    title: "Allow access to continue",
    subtitle:
      "Camera, microphone, and location are required for the video declaration. We only use them to record your declaration — nothing is shared.",
    introNote:
      "Your browser will ask for permission the first time you tap each “Allow” button. Please choose “Allow” on every popup to move forward.",
    statusGranted: "Allowed",
    statusPrompt: "Tap Allow",
    statusDenied: "Blocked",
    statusUnsupported: "Not supported",
    statusChecking: "Checking…",
    cameraLabel: "Camera",
    cameraDesc: "To record your video declaration.",
    micLabel: "Microphone",
    micDesc: "To capture your voice while you speak.",
    locationLabel: "Location",
    locationDesc: "To record where the declaration was made.",
    allow: "Allow",
    continue: "Continue to video declaration",
    blockedHint:
      "This permission is blocked in your browser. Open the address-bar lock icon (or browser settings) for this site and turn it back on, then come back and tap “Allow” again.",
    settingsCta: "How to enable in browser",
    secureContextHint:
      "Camera, microphone, and location only work on a secure origin (HTTPS or localhost). Open this page over HTTPS to continue."
  },
  hi: {
    title: "आगे बढ़ने के लिए access allow करें",
    subtitle:
      "Video declaration के लिए camera, microphone और location जरूरी हैं। हम इन्हें सिर्फ आपकी declaration record करने के लिए use करते हैं — कुछ share नहीं होता।",
    introNote:
      "पहली बार “Allow” tap करने पर browser permission माँगेगा। आगे बढ़ने के लिए हर popup में “Allow” चुनें।",
    statusGranted: "Allow हो गया",
    statusPrompt: "Allow tap करें",
    statusDenied: "Blocked है",
    statusUnsupported: "Supported नहीं है",
    statusChecking: "Check हो रहा है…",
    cameraLabel: "Camera",
    cameraDesc: "आपकी video declaration record करने के लिए।",
    micLabel: "Microphone",
    micDesc: "आपकी आवाज़ capture करने के लिए।",
    locationLabel: "Location",
    locationDesc: "Declaration कहाँ की गई, record करने के लिए।",
    allow: "Allow करें",
    continue: "Video declaration पर जाएँ",
    blockedHint:
      "यह permission browser में blocked है। Address bar के lock icon (या browser settings) से इसे on करें, फिर वापस आकर “Allow” tap करें।",
    settingsCta: "Browser में कैसे enable करें",
    secureContextHint:
      "Camera, microphone और location सिर्फ secure origin (HTTPS या localhost) पर काम करते हैं। आगे बढ़ने के लिए इस page को HTTPS से खोलें।"
  }
};

// Status values for each permission. `'unknown'` is the pre-query state.
const PERM_STATUS = {
  UNKNOWN: "unknown",
  CHECKING: "checking",
  GRANTED: "granted",
  PROMPT: "prompt",
  DENIED: "denied",
  UNSUPPORTED: "unsupported"
};

function initialPermissionState() {
  return {
    camera: PERM_STATUS.UNKNOWN,
    microphone: PERM_STATUS.UNKNOWN,
    location: PERM_STATUS.UNKNOWN
  };
}

const initialFaceState = {
  ready: false,
  message: "Start camera to run face readiness check.",
  faceCount: 0,
  hasOneFace: false,
  centered: false,
  goodSize: false,
  lightingOk: false,
  stable: false,
  consecutiveGoodChecks: 0
};

export default function VideoDeclarationScreen({
  token,
  language = "en",
  buyerName,
  locationCoords,
  onBack,
  onSubmitted,
  onStatusChanged
}) {
  const t = content[language] || content.en;

  const [screenRaw, setScreenRaw] = useState("permissions");

  useAudioGuide(
    screenRaw === "permissions" || screenRaw === "camera"
      ? "5"
      : screenRaw === "record"
      ? "6"
      : null
  );

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const detectorRef = useRef(null);
  const detectionTimerRef = useRef(null);
  const prevBoxRef = useRef(null);
  const consecutiveGoodRef = useRef(0);
  const consecutiveBadRecordingFramesRef = useRef(0);
  const recordingErrorRef = useRef(null);
  const recordingRef = useRef(false);
  const recordingStartedAtRef = useRef(null);

  const statsRef = useRef({
    checks: 0,
    faceVisibleCount: 0,
    singleFaceRatio: 0,
    centeredCount: 0,
    goodSizeCount: 0,
    lightingOkCount: 0,
    stableCount: 0,
    goodFrameCount: 0,
    multipleFaceCount: 0
  });

  // Bug A13: persist screen, declaration, and form to sessionStorage so
  // a page reload mid-flow doesn't wipe the buyer's progress (including
  // the runtimeCode, which is regenerated on every fresh session).
  // Scoped by token so two buyers in two tabs don't collide.
  const storageKey = `kyc-video-state:${token || "anon"}`;

  function loadPersisted(key) {
    try {
      const raw = window.sessionStorage.getItem(`${storageKey}:${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function savePersisted(key, value) {
    try {
      if (value == null) {
        window.sessionStorage.removeItem(`${storageKey}:${key}`);
      } else {
        window.sessionStorage.setItem(
          `${storageKey}:${key}`,
          JSON.stringify(value)
        );
      }
    } catch {
      // sessionStorage unavailable (private mode, quota, etc.) — ignore.
    }
  }

  const [workspace, setWorkspace] = useState(null);
  const [declaration, setDeclarationRaw] = useState(loadPersisted("declaration"));
  // screenRaw is already defined above
  useEffect(() => {
    const savedScreen = loadPersisted("screen");
    if (savedScreen) {
      setScreenRaw(savedScreen);
    }
  }, []);
  const screen = screenRaw;
  const [recordingError, setRecordingError] = useState("");

  // Bug A13: persist screen and declaration to sessionStorage so a
  // page reload mid-flow doesn't wipe the runtimeCode or progress.
  // These wrappers keep persistence in sync with the setters.
  const setScreen = (value) => {
    setScreenRaw(value);
    savePersisted("screen", value);
  };
  const setDeclaration = (value) => {
    setDeclarationRaw(value);
    savePersisted("declaration", value);
  };

  const [form, setFormRaw] = useState(() => {
    const persisted = loadPersisted("form");
    return (
      persisted || {
        declarantFullName: "",
        declarantRole: "",
        businessName: buyerName || "",
        language
      }
    );
  });

  const setForm = (updater) => {
    setFormRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      savePersisted("form", next);
      return next;
    });
  };

  const [permStatus, setPermStatus] = useState(initialPermissionState);
  const [permRequesting, setPermRequesting] = useState(null);
  const [permError, setPermError] = useState("");
  const [gateCoords, setGateCoords] = useState(locationCoords || null);
  const [gatePassed, setGatePassed] = useState(false);

  const [faceState, setFaceState] = useState(initialFaceState);
  const [qualitySnapshot, setQualitySnapshot] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [recordedBlob, setRecordedBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(0);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // A video declaration reaches a buyer-terminal state in two ways:
  //   - status === "submitted": the buyer just uploaded, waiting for the reviewer
  //   - status === "accepted":  the reviewer already accepted; nothing to do
  // Both should land the buyer on the "done" view, not the re-recordable
  // camera screen. Bug A11: previously only "submitted" was handled, so a
  // re-opened KYC with an accepted video showed a camera-availability UI
  // that the backend would refuse (VIDEO_ALREADY_ACCEPTED).
  const isSubmitted =
    workspace?.kyc?.overallStatus === "submitted" ||
    declaration?.status === "submitted" ||
    declaration?.status === "accepted";

  const canStartRecording = faceState.ready && !isRecording && !recordedBlob;
  const canSubmit = recordedBlob && qualitySnapshot?.faceCheckPassed;

  // Notify the parent that a master-state-changing operation completed
  // (script generated, video uploaded). Parent uses this to refresh its
  // own snapshot of the KYC. Bug A20.
  const notifyStatusChanged = () => {
    if (typeof onStatusChanged === "function") {
      onStatusChanged();
    }
  };

  function resetRecordingStats() {
    statsRef.current = {
      checks: 0,
      faceVisibleCount: 0,
      singleFaceCount: 0,
      centeredCount: 0,
      goodSizeCount: 0,
      lightingOkCount: 0,
      stableCount: 0,
      goodFrameCount: 0,
      multipleFaceCount: 0
    };
  }

  function updateRecordingStats(analysis) {
    const stats = statsRef.current;

    stats.checks += 1;

    if (analysis.faceCount > 0) stats.faceVisibleCount += 1;
    if (analysis.faceCount === 1) stats.singleFaceCount += 1;
    if (analysis.faceCount > 1) stats.multipleFaceCount += 1;
    if (analysis.centered) stats.centeredCount += 1;
    if (analysis.goodSize) stats.goodSizeCount += 1;
    if (analysis.lightingOk) stats.lightingOkCount += 1;
    if (analysis.stable) stats.stableCount += 1;
    if (analysis.isGood) stats.goodFrameCount += 1;
  }

  function buildQualitySnapshot(duration) {
    const stats = statsRef.current;
    const checks = Math.max(stats.checks, 1);

    const faceVisibleRatio = stats.faceVisibleCount / checks;
    const singleFaceRatio = stats.singleFaceCount / checks;
    const centeredRatio = stats.centeredCount / checks;
    const goodSizeRatio = stats.goodSizeCount / checks;
    const lightingOkRatio = stats.lightingOkCount / checks;
    const stableRatio = stats.stableCount / checks;
    const goodFrameRatio = stats.goodFrameCount / checks;

    const faceCheckPassed =
      duration >= 6 &&
      faceVisibleRatio >= 0.90 &&
      centeredRatio >= 0.5 &&
      goodSizeRatio >= 0.5 &&
      lightingOkRatio >= 0.45 &&
      stableRatio >= 0.45;

    return {
      faceCheckPassed,
      durationSeconds: duration,
      totalChecks: stats.checks,
      faceVisibleRatio,
      singleFaceRatio,
      centeredRatio,
      goodSizeRatio,
      lightingOkRatio,
      stableRatio,
      goodFrameRatio,
      multipleFaceCount: stats.multipleFaceCount,
      model: "mediapipe_face_detector",
      checkIntervalMs: 700
    };
  }

  // ---------- Permission gate (camera + microphone + location) ----------
  // The video declaration legally requires all three. We don't let the buyer
  // move forward until every permission is "granted" — anything less blocks
  // the flow with a single "Allow" button per missing permission that re-opens
  // the browser's native prompt.
  async function checkAllPermissions() {
    const next = { ...permStatus };

    if (
      typeof navigator !== "undefined" &&
      navigator.permissions &&
      typeof navigator.permissions.query === "function"
    ) {
      // Camera + microphone are queried separately so we can tell the user
      // which one is still missing. Some browsers throw for these names —
      // fall back to PROMPT so the Allow button still works.
      try {
        const cam = await navigator.permissions.query({ name: "camera" });
        next.camera =
          cam.state === "granted"
            ? PERM_STATUS.GRANTED
            : cam.state === "denied"
              ? PERM_STATUS.DENIED
              : PERM_STATUS.PROMPT;
      } catch {
        next.camera = PERM_STATUS.PROMPT;
      }

      try {
        const mic = await navigator.permissions.query({ name: "microphone" });
        next.microphone =
          mic.state === "granted"
            ? PERM_STATUS.GRANTED
            : mic.state === "denied"
              ? PERM_STATUS.DENIED
              : PERM_STATUS.PROMPT;
      } catch {
        next.microphone = PERM_STATUS.PROMPT;
      }

      try {
        const geo = await navigator.permissions.query({ name: "geolocation" });
        next.location =
          geo.state === "granted"
            ? PERM_STATUS.GRANTED
            : geo.state === "denied"
              ? PERM_STATUS.DENIED
              : PERM_STATUS.PROMPT;
      } catch {
        next.location = PERM_STATUS.UNSUPPORTED;
      }
    } else {
      next.camera = PERM_STATUS.PROMPT;
      next.microphone = PERM_STATUS.PROMPT;
      next.location = PERM_STATUS.UNSUPPORTED;
    }

    // Detect unsupported environments (http://LAN-IP without secure context,
    // old browsers, etc.) so we can tell the user the popup will never appear.
    const isSecure =
      typeof window === "undefined" ? true : window.isSecureContext;
    const hasGetUserMedia =
      typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function";
    const hasGeolocation =
      typeof navigator !== "undefined" &&
      navigator.geolocation &&
      typeof navigator.geolocation.getCurrentPosition === "function";

    if (!isSecure && (!hasGetUserMedia || !hasGeolocation)) {
      next.camera = PERM_STATUS.UNSUPPORTED;
      next.microphone = PERM_STATUS.UNSUPPORTED;
      next.location = PERM_STATUS.UNSUPPORTED;
    } else {
      if (!hasGetUserMedia) {
        next.camera = PERM_STATUS.UNSUPPORTED;
        next.microphone = PERM_STATUS.UNSUPPORTED;
      }
      if (!hasGeolocation) {
        next.location = PERM_STATUS.UNSUPPORTED;
      }
    }

    setPermStatus(next);

    if (
      next.camera === PERM_STATUS.GRANTED &&
      next.microphone === PERM_STATUS.GRANTED &&
      next.location === PERM_STATUS.GRANTED
    ) {
      setGatePassed(true);
    }

    return next;
  }

  async function requestPermission(kind) {
    if (permRequesting) return;

    setPermRequesting(kind);
    setPermError("");

    try {
      if (kind === "location") {
        if (
          typeof navigator === "undefined" ||
          !navigator.geolocation ||
          typeof navigator.geolocation.getCurrentPosition !== "function"
        ) {
          throw new Error("UNSUPPORTED");
        }

        const position = await new Promise((resolve, reject) => {
          const settled = { done: false };
          const finish = (handler, value) => {
            if (settled.done) return;
            settled.done = true;
            handler(value);
          };
          try {
            navigator.geolocation.getCurrentPosition(
              (pos) => finish(resolve, pos),
              (err) => finish(reject, err),
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
          } catch (err) {
            finish(reject, err);
          }
        });

        setGateCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      } else {
        if (
          typeof navigator === "undefined" ||
          !navigator.mediaDevices ||
          typeof navigator.mediaDevices.getUserMedia !== "function"
        ) {
          throw new Error("UNSUPPORTED");
        }

        // Request only what the user clicked, so the native popup is scoped.
        // Camera and microphone are technically requested together by the
        // browser, but we still track them separately so the UI is honest.
        const constraints =
          kind === "camera"
            ? { video: { facingMode: "user" } }
            : { audio: true };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach((track) => track.stop());
      }

      // Re-query Permissions API so the row flips to "Allowed" right away.
      const next = { ...permStatus };
      next[kind] = PERM_STATUS.GRANTED;

      // When the user grants camera, also flip microphone to PROMPT so the
      // next Allow button still has work to do. (Browser grants them together
      // but we keep them logically separate in the UI.)
      if (kind === "camera" && next.microphone === PERM_STATUS.UNKNOWN) {
        next.microphone = PERM_STATUS.PROMPT;
      }
      if (kind === "microphone" && next.camera === PERM_STATUS.UNKNOWN) {
        next.camera = PERM_STATUS.PROMPT;
      }

      setPermStatus(next);

      if (
        next.camera === PERM_STATUS.GRANTED &&
        next.microphone === PERM_STATUS.GRANTED &&
        next.location === PERM_STATUS.GRANTED
      ) {
        setGatePassed(true);
      }
    } catch (err) {
      // The browser refuses to re-prompt after an explicit deny, so we have
      // to teach the user how to flip the switch in their browser settings.
      const denied =
        err?.name === "NotAllowedError" ||
        err?.name === "PermissionDeniedError" ||
        err?.message === "UNSUPPORTED";

      setPermStatus((prev) => ({
        ...prev,
        [kind]: denied
          ? err?.message === "UNSUPPORTED"
            ? PERM_STATUS.UNSUPPORTED
            : PERM_STATUS.DENIED
          : prev[kind]
      }));

      if (!denied && err) {
        setPermError(
          err?.message || "Unable to request permission. Please try again."
        );
      }
    } finally {
      setPermRequesting(null);
    }
  }

  function handleContinueFromGate() {
    if (!gatePassed) return;
    setScreen("details");
  }

  async function loadWorkspace() {
    try {
      setIsLoading(true);
      setError("");

      const result = await getKycVideoWorkspace(token);

      if (!result.success) {
        setError(result.message || "Unable to load video declaration.");
        return;
      }

      setWorkspace(result);
      setDeclaration(result.declaration);

      // Respect the permission gate: only fast-forward past it if every
      // permission is already granted. Otherwise stay on "permissions" so the
      // buyer is forced to address any missing permission.
      if (
        result.declaration?.status === "submitted" ||
        result.declaration?.status === "accepted"
      ) {
        setScreen("done");
      } else if (
        permStatus.camera === PERM_STATUS.GRANTED &&
        permStatus.microphone === PERM_STATUS.GRANTED &&
        permStatus.location === PERM_STATUS.GRANTED
      ) {
        setScreen("camera");
      }

      setForm((prev) => ({
        ...prev,
        businessName:
          result.declaration?.businessName ||
          result.kyc?.buyerName ||
          buyerName ||
          prev.businessName,
        declarantFullName:
          result.declaration?.declarantFullName || prev.declarantFullName,
        declarantRole: result.declaration?.declarantRole || prev.declarantRole,
        language: result.declaration?.language || language
      }));
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Unable to load video declaration. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function attachStreamToVideo(stream = streamRef.current) {
    const video = videoRef.current;

    if (!video || !stream) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    try {
      await video.play();
    } catch (error) {
      console.log("Video play warning:", error.message);
    }
  }

  // Track the previous screen so the effect body can decide whether
  // we're transitioning INTO camera/recording (re-attach stream),
  // BETWEEN camera and recording (keep stream alive), or OUT of
  // camera/recording (release stream). The previous implementation
  // stopped the camera in the cleanup whenever [screen] changed,
  // which killed the stream on camera→recording and left the buyer
  // staring at a black <video> on the recording screen. Bug A14+.
  const prevScreenRef = useRef(null);

  useEffect(() => {
    const wasInCameraOrRecording =
      prevScreenRef.current === "camera" ||
      prevScreenRef.current === "recording";
    const isInCameraOrRecording =
      screen === "camera" || screen === "recording";

    if (wasInCameraOrRecording && !isInCameraOrRecording) {
      // Buyer is leaving the camera/recording screens entirely —
      // release the stream so the LED turns off and the mic LED too.
      stopCamera();
    }

    if (isInCameraOrRecording && streamRef.current) {
      // We're in camera/recording and have a stream — re-attach it
      // to the current <video> element. This runs on every entry into
      // these screens (including camera→recording), so the recording
      // view always shows the buyer's face.
      setTimeout(() => {
        attachStreamToVideo();
      }, 100);
    }

    if (
      screen === "camera" &&
      !wasInCameraOrRecording &&
      !streamRef.current &&
      !isCameraStarting &&
      permStatus.camera === PERM_STATUS.GRANTED &&
      permStatus.microphone === PERM_STATUS.GRANTED
    ) {
      startCamera();
    }

    prevScreenRef.current = screen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, permStatus.camera, permStatus.microphone]);

  // Final safety net: if the component unmounts while the camera is
  // running, release the stream. Without this, switching tokens or
  // navigating away would leave the LED on.
  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadWorkspace();

    return () => {
      stopCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Run the gate check on mount. If everything is already granted (e.g. the
  // buyer reloads), we skip straight to the details step.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const next = await checkAllPermissions();
      if (cancelled) return;

      if (
        next.camera === PERM_STATUS.GRANTED &&
        next.microphone === PERM_STATUS.GRANTED &&
        next.location === PERM_STATUS.GRANTED
      ) {
        setScreen((prev) => (prev === "permissions" ? "details" : prev));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Bug A12: only force "done" when the buyer is NOT actively
    // recording. A poll / admin action / concurrent tab can flip
    // declaration.status to "submitted" while the buyer is in the
    // middle of recording; we must not yank them out of the recording
    // screen at that point. The post-submit transition is handled
    // explicitly inside submitVideo itself.
    if (isSubmitted && !isRecording) {
      setScreen("done");
    }
  }, [isSubmitted, isRecording]);

  async function handleGenerateScript() {
    // Refuse to start a new session if the video is already locked
    // (accepted or already submitted) — backend would 403. Bug A19.
    if (
      declaration?.status === "accepted" ||
      declaration?.status === "submitted"
    ) {
      setError(
        declaration.status === "accepted"
          ? "Your video declaration is already accepted and locked. No further action is needed."
          : "Your video declaration is already submitted and waiting for review."
      );
      return;
    }

    try {
      setIsGenerating(true);
      setError("");
      setSuccess("");

      const result = await startKycVideoDeclaration(token, {
        ...form,
        language,
        latitude: gateCoords?.latitude ?? locationCoords?.latitude,
        longitude: gateCoords?.longitude ?? locationCoords?.longitude
      });

      if (!result.success) {
        setError(result.message || "Unable to generate declaration script.");
        return;
      }

      setDeclaration(result.declaration);
      setSuccess("Declaration script generated successfully.");
      setScreen("camera");
      // Backend moves the master to `video_declaration_started`. Notify
      // the parent so its snapshot and stepper are fresh. Bug A20.
      notifyStatusChanged();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Unable to generate declaration script."
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function initializeFaceDetector() {
    if (detectorRef.current) return detectorRef.current;

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    const detector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"
      },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.55
    });

    detectorRef.current = detector;
    return detector;
  }

  async function startCamera() {
    try {
      setIsCameraStarting(true);
      setError("");
      setSuccess("");

      // Pre-flight: catch the secure-context case before getUserMedia
      // throws an opaque error — that's the #1 reason this fails on
      // http://LAN-IP during local dev.
      if (
        typeof window !== "undefined" &&
        !window.isSecureContext &&
        (!navigator.mediaDevices ||
          typeof navigator.mediaDevices.getUserMedia !== "function")
      ) {
        throw new Error("INSECURE_CONTEXT");
      }

      await initializeFaceDetector();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: true
      });

      streamRef.current = stream;

      await attachStreamToVideo(stream);

      startFaceDetectionLoop();
      setSuccess("Camera started. Keep your face centered for 2 seconds.");
    } catch (err) {
      setError(describeMediaError(err));
    } finally {
      setIsCameraStarting(false);
    }
  }

  function describeMediaError(err) {
    if (!err) return "Unable to access camera/microphone. Please allow permissions.";
    if (err.message === "INSECURE_CONTEXT") {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "this URL";
      const httpsOrigin = origin.replace(/^http:/, "https:");
      return (
        `Camera and microphone are blocked because ${origin} is served over HTTP. ` +
        `Easiest fix: open ${httpsOrigin} after running \`npm run dev:https\` in the frontend folder. ` +
        `Or in Chrome: chrome://flags/#unsafely-treat-insecure-origin-as-secure → add "${origin}" → restart Chrome.`
      );
    }
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      return "Camera and microphone access was blocked. Please allow access in your browser and try again.";
    }
    if (err.name === "NotFoundError") {
      return "No camera or microphone was found on this device. Please connect one and try again.";
    }
    if (err.name === "NotReadableError" || err.name === "TrackStartError") {
      return "Your camera or microphone is being used by another app. Please close it and try again.";
    }
    if (err.name === "SecurityError") {
      return "Camera and microphone access requires a secure (HTTPS) connection.";
    }
    return err.message || "Unable to access camera/microphone. Please allow permissions.";
  }

  function startFaceDetectionLoop() {
    clearInterval(detectionTimerRef.current);

    detectionTimerRef.current = setInterval(async () => {
      if (!videoRef.current || !detectorRef.current) return;

      const video = videoRef.current;

      if (video.readyState < 2 || !video.videoWidth) return;

      const result = detectorRef.current.detectForVideo(
        video,
        performance.now()
      );

      const analysis = analyzeFaceFrame({
        detections: result.detections || [],
        video,
        canvas: canvasRef.current,
        prevBoxRef
      });

      if (analysis.isGood) {
        consecutiveGoodRef.current += 1;
      } else {
        consecutiveGoodRef.current = 0;
      }

      const ready = consecutiveGoodRef.current >= 3;

      setFaceState({
        ...analysis,
        ready,
        consecutiveGoodChecks: consecutiveGoodRef.current,
        message: getFaceMessage({ ...analysis, ready })
      });

      if (recordingRef.current) {
        updateRecordingStats(analysis);
        
        if (analysis.faceCount === 0) {
          consecutiveBadRecordingFramesRef.current += 1;
          if (consecutiveBadRecordingFramesRef.current >= 2) {
            recordingErrorRef.current = "Recording stopped automatically. Face was not detected or hidden. Please record again.";
            stopRecording();
          }
        } else {
          consecutiveBadRecordingFramesRef.current = 0;
        }
      }
    }, 700);
  }

  function stopCamera() {
    clearInterval(detectionTimerRef.current);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    streamRef.current = null;
    recordingRef.current = false;
  }

  async function startRecording() {
    if (!streamRef.current || !faceState.ready) {
      setError("Face readiness check must pass before recording.");
      return;
    }

    await attachStreamToVideo();

    resetRecordingStats();
    prevBoxRef.current = null;
    consecutiveGoodRef.current = 0;
    consecutiveBadRecordingFramesRef.current = 0;
    recordingErrorRef.current = null;

    setError("");
    setSuccess("");
    setRecordedBlob(null);
    setPreviewUrl("");
    setQualitySnapshot(null);
    setDurationSeconds(0);

    const mimeType = getSupportedMimeType();

    const recorder = mimeType
      ? new MediaRecorder(streamRef.current, { mimeType })
      : new MediaRecorder(streamRef.current);

    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const finalMimeType = recorder.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type: finalMimeType });

      const duration = Math.max(
        1,
        Math.round((Date.now() - recordingStartedAtRef.current) / 1000)
      );

      const snapshot = buildQualitySnapshot(duration);

      recordingRef.current = false;
      setIsRecording(false);

      if (recordingErrorRef.current) {
        setRecordingError(recordingErrorRef.current);
        setSuccess("");
        setRecordedBlob(null);
        setPreviewUrl("");
        setQualitySnapshot(null);
        // Do not stopCamera() so feed stays alive.
        recordingErrorRef.current = null;
      } else {
        stopCamera();
        setRecordedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        setDurationSeconds(duration);
        setQualitySnapshot(snapshot);
        setSuccess(
          snapshot.faceCheckPassed
            ? "Recording completed. Preview and submit your declaration."
            : "Recording completed, but quality check is weak. Please retake."
        );
        setScreen("preview");
      }
    };

    recorderRef.current = recorder;
    recordingStartedAtRef.current = Date.now();
    recordingRef.current = true;

    recorder.start(1000);
    setIsRecording(true);
    setScreen("recording");
    setSuccess("Recording started. Read the full script clearly.");
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setRecordedBlob(null);
    setPreviewUrl("");
    setDurationSeconds(0);
    setQualitySnapshot(null);
    setScreen("camera");
    setSuccess("You can start camera check and record again.");
  }

  async function submitVideo() {
    if (!recordedBlob || !qualitySnapshot?.faceCheckPassed) {
      setError("Please record a valid video with face check passed.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");
      setSuccess("");

      const formData = new FormData();

      const uploadMimeType = recordedBlob.type?.includes("mp4")
        ? "video/mp4"
        : "video/webm";

      formData.append(
        "video",
        new File([recordedBlob], `kyc-video-${Date.now()}.webm`, {
          type: uploadMimeType
        })
      );

      formData.append("durationSeconds", String(durationSeconds));
      formData.append("faceCheckPassed", String(qualitySnapshot.faceCheckPassed));
      formData.append(
        "faceQualityMetadata",
        JSON.stringify(qualitySnapshot)
      );

      const effectiveCoords = gateCoords || locationCoords;
      if (effectiveCoords?.latitude) {
        formData.append("latitude", String(effectiveCoords.latitude));
      }
      if (effectiveCoords?.longitude) {
        formData.append("longitude", String(effectiveCoords.longitude));
      }

      const result = await uploadKycVideoDeclaration(token, formData);

      if (!result.success) {
        setError(result.message || "Unable to submit video declaration.");
        return;
      }

      setDeclaration(result.declaration);
      setSuccess("Video declaration submitted successfully.");
      setScreen("done");
      stopCamera();

      // Bug A13: clear the persisted session so a future entry
      // (e.g. reviewer re-opens the link) starts clean instead of
      // landing on this buyer's old in-progress screen.
      savePersisted("screen", null);
      savePersisted("declaration", null);
      savePersisted("form", null);

      // Advance the parent stepper to "done" (100%) IMMEDIATELY on success.
      // This must run before any further await — a failing re-fetch must never
      // strand the buyer on the 75% "Video" step after a successful submit.
      if (typeof onSubmitted === "function") {
        onSubmitted();
      }

      // Bug A20: silently refresh the parent's snapshot so the BuyerLayout
      // stepper and any "done" view shows the correct overallStatus/currentStage
      // (otherwise it stays at the pre-submit value until the user navigates
      // back to the parent).
      notifyStatusChanged();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Unable to submit video declaration. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // Auto-start camera when landing on the "camera" readiness check step
  useEffect(() => {
    if (screen === "camera" && !streamRef.current && !isCameraStarting) {
      startCamera();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  return (
    <div className="rounded-2xl space-y-6">
      {screen === "permissions" && (
        <VideoPermissionGate
          t={PERMISSION_GATE_TEXT[language] || PERMISSION_GATE_TEXT.en}
          permStatus={permStatus}
          permRequesting={permRequesting}
          permError={permError}
          gatePassed={gatePassed}
          onAllow={requestPermission}
          onContinue={handleContinueFromGate}
          onRecheck={checkAllPermissions}
          onBack={onBack}
        />
      )}

      {screen === "details" && (
        <VideoDetailsStep
          t={t}
          form={form}
          setForm={setForm}
          isGenerating={isGenerating}
          declaration={declaration}
          handleGenerateScript={handleGenerateScript}
          onBack={onBack}
        />
      )}

      {screen === "camera" && (
        <VideoCameraStep
          t={t}
          declaration={declaration}
          videoRef={videoRef}
          canvasRef={canvasRef}
          faceState={faceState}
          startCamera={startCamera}
          isCameraStarting={isCameraStarting}
          onContinue={() => setScreen("recording")}
          onBack={() => setScreen("details")}
        />
      )}

      {screen === "recording" && (
        <VideoRecordingStep
          t={t}
          declaration={declaration}
          videoRef={videoRef}
          canvasRef={canvasRef}
          isRecording={isRecording}
          startRecording={startRecording}
          stopRecording={stopRecording}
          canStartRecording={canStartRecording}
          faceState={faceState}
          onBack={() => setScreen("camera")}
          recordingError={recordingError}
          onRecordAgain={() => {
            setRecordingError("");
            startRecording();
          }}
        />
      )}

      {screen === "preview" && (
        <VideoPreviewStep
          t={t}
          previewUrl={previewUrl}
          qualitySnapshot={qualitySnapshot}
          durationSeconds={durationSeconds}
          retake={retake}
          submitVideo={submitVideo}
          isSubmitting={isSubmitting}
          canSubmit={canSubmit}
          error={error}
          success={success}
        />
      )}

      {screen === "done" && (
        <VideoDoneStep t={t} onBack={onBack} />
      )}
    </div>
  );
}

/**
 * Hard permission gate shown before the video declaration form.
 *
 * Camera + microphone + location are all mandatory. Each row shows the
 * current state ("Tap Allow" / "Allowed" / "Blocked" / "Not supported") and
 * exposes a single Allow button per missing permission. Clicking the button
 * re-opens the browser's native permission prompt. Once all three are
 * granted, the "Continue" button activates and advances to the existing
 * details / camera / recording flow.
 *
 * If a permission ends up in DENIED state, the native popup will no longer
 * fire — we replace the button with a small browser-settings hint.
 */
function VideoPermissionGate({
  t,
  permStatus,
  permRequesting,
  permError,
  gatePassed,
  onAllow,
  onContinue,
  onRecheck,
  onBack
}) {
  const rows = [
    {
      key: "camera",
      label: t.cameraLabel,
      desc: t.cameraDesc,
      Icon: Camera
    },
    {
      key: "microphone",
      label: t.micLabel,
      desc: t.micDesc,
      Icon: Mic
    },
    {
      key: "location",
      label: t.locationLabel,
      desc: t.locationDesc,
      Icon: MapPin
    }
  ];

  const grantedCount = rows.filter(
    (r) => permStatus[r.key] === PERM_STATUS.GRANTED
  ).length;
  const allGranted = grantedCount === rows.length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status="active" label="Documents completed" />
        <StatusPill status="pending" label="Permissions required" />
      </div>

      <h1 className="mt-7 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
        {t.title}
      </h1>

      <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
        {t.subtitle}
      </p>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-3.5">
        <ShieldCheck
          size={18}
          className="mt-0.5 shrink-0 text-blue-700"
        />
        <p className="text-xs leading-5 text-slate-600">{t.introNote}</p>
      </div>

      <div className="mt-8 space-y-3">
        {rows.map(({ key, label, desc, Icon }) => {
          const status = permStatus[key];
          return (
            <PermissionRow
              key={key}
              Icon={Icon}
              label={label}
              desc={desc}
              status={status}
              t={t}
              isLoading={permRequesting === key}
              anyLoading={!!permRequesting}
              onAllow={() => onAllow(key)}
            />
          );
        })}
      </div>

      {permError ? (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">
          {permError}
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            {grantedCount}/{rows.length} {label_for_count(rows.length)}
          </p>
          <button
            type="button"
            onClick={onRecheck}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
          >
            <RefreshCcw size={13} />
            {t.statusChecking}
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onContinue}
            disabled={!gatePassed || !allGranted}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
          >
            {t.continue}
            <ArrowRight size={17} />
          </button>

          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
          >
            <ArrowLeft size={17} />
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function label_for_count(n) {
  return n === 1 ? "permission allowed" : "permissions allowed";
}

function PermissionRow({
  Icon,
  label,
  desc,
  status,
  t,
  isLoading,
  anyLoading,
  onAllow
}) {
  const isGranted = status === PERM_STATUS.GRANTED;
  const isDenied = status === PERM_STATUS.DENIED;
  const isUnsupported = status === PERM_STATUS.UNSUPPORTED;
  const isPrompt = status === PERM_STATUS.PROMPT || status === PERM_STATUS.UNKNOWN;

  const statusLabel = isGranted
    ? t.statusGranted
    : isDenied
      ? t.statusDenied
      : isUnsupported
        ? t.statusUnsupported
        : t.statusPrompt;

  const statusTone = isGranted
    ? "bg-emerald-50 text-emerald-700"
    : isDenied
      ? "bg-red-50 text-red-700"
      : isUnsupported
        ? "bg-slate-100 text-slate-500"
        : "bg-amber-50 text-amber-700";

  const containerTone = isGranted
    ? "border-emerald-200 bg-emerald-50/40"
    : isDenied
      ? "border-red-200 bg-red-50/40"
      : isUnsupported
        ? "border-slate-200 bg-slate-50"
        : "border-amber-200 bg-amber-50/40";

  const iconTone = isGranted
    ? "bg-emerald-100 text-emerald-700"
    : isDenied
      ? "bg-red-100 text-red-700"
      : isUnsupported
        ? "bg-slate-200 text-slate-500"
        : "bg-amber-100 text-amber-700";

  return (
    <div
      className={`rounded-2xl border p-4 transition ${containerTone}`}
      data-status={status}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconTone}`}
        >
          <Icon size={20} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-navy">{label}</p>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${statusTone}`}
            >
              {isGranted ? (
                <CheckCircle2 size={11} />
              ) : isDenied ? (
                <ShieldAlert size={11} />
              ) : null}
              {statusLabel}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{desc}</p>

          {isDenied ? (
            <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-red-100 bg-white p-2.5 text-[11px] leading-5 text-red-700">
              <ShieldAlert size={13} className="mt-0.5 shrink-0" />
              <span>{t.blockedHint}</span>
            </div>
          ) : null}

          {isUnsupported ? (
            <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] leading-5 text-slate-600">
              <ShieldAlert size={13} className="mt-0.5 shrink-0" />
              <span>{t.secureContextHint}</span>
            </div>
          ) : null}
        </div>

        {!isGranted && !isUnsupported ? (
          <button
            type="button"
            onClick={onAllow}
            disabled={anyLoading}
            className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold uppercase tracking-[0.1em] transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isDenied
                ? "border border-red-200 bg-white text-red-700 hover:bg-red-50"
                : isPrompt
                  ? "bg-navy text-white hover:bg-navy/90"
                  : "bg-slate-200 text-slate-600"
            }`}
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={14} />
            ) : null}
            {isDenied ? t.settingsCta : t.allow}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function VideoDetailsStep({
  t,
  form,
  setForm,
  isGenerating,
  declaration,
  handleGenerateScript,
  onBack
}) {
  return (
    <div className="pb-28 sm:pb-0">
      {/* Desktop header */}
      <div className="hidden sm:block">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status="active" label="Documents completed" />
          <StatusPill status="pending" label="Video pending" />
        </div>

        <h1 className="mt-7 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
          Authorized person details
        </h1>

        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
          Enter the person details. Backend will generate a unique script and runtime code.
        </p>
      </div>

      {/* Mobile: compact header with progress */}
      <div className="flex flex-wrap items-center gap-2 sm:hidden">
        <StatusPill status="active" label="Docs done" />
        <StatusPill status="pending" label="Fill details" />
      </div>

      <div className="mt-8 max-w-2xl space-y-3 sm:space-y-4">
        <Input
          label={t.fullName}
          value={form.declarantFullName}
          onChange={(value) =>
            setForm((prev) => ({ ...prev, declarantFullName: value }))
          }
          placeholder="Example: Aryan Sharma"
        />

        <Input
          label={t.role}
          value={form.declarantRole}
          onChange={(value) =>
            setForm((prev) => ({ ...prev, declarantRole: value }))
          }
          placeholder="Example: Owner / Director / Partner"
        />

        <Input
          label={t.businessName}
          value={form.businessName}
          onChange={(value) =>
            setForm((prev) => ({ ...prev, businessName: value }))
          }
          placeholder="Example: Demo23 Private Limited"
        />
      </div>

      {/* Mobile: sticky bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md sm:hidden"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
          >
            <ArrowLeft size={16} />
            {t.back}
          </button>
          <button
            type="button"
            onClick={handleGenerateScript}
            disabled={isGenerating}
            className="inline-flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                {t.generating}
              </>
            ) : (
              <>
                <ShieldCheck size={16} />
                {declaration ? "Regenerate" : t.generate}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Desktop: inline action bar */}
      <div className="mt-8 hidden flex-col gap-3 sm:flex-row sm:flex">
        <button
          type="button"
          onClick={handleGenerateScript}
          disabled={isGenerating}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-950 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-black disabled:bg-gray-300"
        >
          {isGenerating ? (
            <>
              <Loader2 className="animate-spin" size={17} />
              {t.generating}
            </>
          ) : (
            <>
              <ShieldCheck size={17} />
              {declaration ? "Regenerate script" : t.generate}
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700"
        >
          <ArrowLeft size={17} />
          {t.back}
        </button>
      </div>
    </div>
  );
}

function VideoCameraStep({
  t,
  declaration,
  videoRef,
  canvasRef,
  faceState,
  startCamera,
  isCameraStarting,
  onContinue,
  onBack
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status="active" label="Documents completed" />
        <StatusPill status="pending" label="Camera check" />
      </div>

      <h1 className="mt-7 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
        {t.cameraTitle}
      </h1>

      <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
        Align your face in the center. We need a steady, clear picture to start recording.
      </p>

      <div className="mt-8 mx-auto max-w-2xl">
        <LiveCameraFrame
          videoRef={videoRef}
          canvasRef={canvasRef}
          declaration={declaration}
          showScript={false}
          faceState={faceState}
        />
        <div className="mt-4 text-center">
          <p className="text-sm font-semibold text-navy">
            Status: {faceState.message}
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={startCamera}
          disabled={isCameraStarting}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {isCameraStarting ? (
            <Loader2 className="animate-spin" size={17} />
          ) : (
            <Camera size={17} />
          )}
          {t.startCamera}
        </button>

        <button
          type="button"
          onClick={onContinue}
          disabled={!faceState.ready}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-950 px-6 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-black disabled:bg-gray-300 disabled:shadow-none"
        >
          Continue to recording
          <ArrowRight size={17} />
        </button>

        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700"
        >
          <ArrowLeft size={17} />
          {t.back}
        </button>
      </div>
    </div>
  );
}

/**
 * Tracks whether the viewport is below Tailwind's `sm` breakpoint (640px).
 * Used so the recording step mounts EITHER the desktop frame OR the mobile
 * recorder — never both. Mounting both makes their two <video> elements share
 * one `videoRef`, and React keeps only the last-mounted (mobile) element, so
 * the desktop frame would render black.
 */
function useIsMobile() {
  const query = "(max-width: 639px)";
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (event) => setIsMobile(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isMobile;
}

function VideoRecordingStep({
  t,
  declaration,
  videoRef,
  canvasRef,
  isRecording,
  startRecording,
  stopRecording,
  canStartRecording,
  faceState,
  onBack,
  recordingError,
  onRecordAgain
}) {
  const isMobile = useIsMobile();

  // Mobile: a single, all-in-one recorder view (header + frame + record button
  // are baked into one screen so the user never has to scroll). Rendered alone
  // so its <video> is the only one holding `videoRef`.
  if (isMobile) {
    return (
      <div>
        <MobileRecorderView
          t={t}
          declaration={declaration}
          videoRef={videoRef}
          canvasRef={canvasRef}
          isRecording={isRecording}
          canStartRecording={canStartRecording}
          startRecording={startRecording}
          stopRecording={stopRecording}
          onBack={onBack}
          faceState={faceState}
          recordingError={recordingError}
          onRecordAgain={onRecordAgain}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status="active" label="Camera ready" />
        <StatusPill
          status="pending"
          label={isRecording ? "Recording" : "Ready to record"}
        />
      </div>

      <h1 className="mt-7 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
        Record your video declaration
      </h1>

      <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
        Click Start Recording, then read the script at the top of the video.
        Make sure to read the runtime verification code clearly.
      </p>

      <div className="mx-auto max-w-2xl">
        <LiveCameraFrame
          videoRef={videoRef}
          canvasRef={canvasRef}
          declaration={declaration}
          showScript={true}
          faceState={faceState}
          recordingError={recordingError}
          onRecordAgain={onRecordAgain}
        />
      </div>

      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        {!isRecording ? (
          <button
            type="button"
            onClick={startRecording}
            disabled={!canStartRecording}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-red-100 transition hover:-translate-y-0.5 hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
          >
            <Video size={17} />
            {t.startRecording}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-950 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-black"
          >
            <CircleStop size={17} />
            {t.stopRecording}
          </button>
        )}

        <button
          type="button"
          onClick={onBack}
          disabled={isRecording}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          <ArrowLeft size={17} />
          {t.back}
        </button>
      </div>
    </div>
  );
}

/**
 * Mobile-only recording view. Mirrors the iPhone camera UX:
 *   - back arrow + timer in a dark top bar
 *   - script + code chip in a dark overlay strip
 *   - big circular record button at the bottom (red square when active)
 * Everything is inside the camera frame — no scrolling required.
 */
function MobileRecorderView({
  t,
  declaration,
  videoRef,
  canvasRef,
  isRecording,
  canStartRecording,
  startRecording,
  stopRecording,
  onBack,
  faceState,
  recordingError,
  onRecordAgain
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isRecording) {
      setElapsed(0);
      return;
    }

    const startedAt = Date.now();
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);

    return () => clearInterval(tick);
  }, [isRecording]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeLabel = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  const borderColor = faceState?.ready ? "border-emerald-500" : "border-red-500";

  return (
    <div className={`overflow-hidden rounded-2xl border-4 bg-gray-950 shadow-xl transition-colors duration-300 ${borderColor}`}>
      {/* Top bar — back, timer, status */}
      <div className="flex items-center justify-between bg-black/60 px-4 py-3 text-white">
        <button
          type="button"
          onClick={onBack}
          disabled={isRecording}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition active:scale-95 disabled:opacity-40"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isRecording ? "bg-red-500 animate-pulse" : "bg-white/40"
            }`}
          />
          <span className="text-sm font-bold tracking-wider tabular-nums">
            {isRecording ? `REC ${timeLabel}` : "READY"}
          </span>
        </div>

        <div className="w-9" />
      </div>

      {/* Camera area — 3:4 portrait, fills the phone screen */}
      <div className="relative aspect-[3/4]">
        {recordingError && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-6 text-center backdrop-blur-sm">
            <UserRound size={48} className="text-red-500 mb-4" />
            <p className="text-xl font-bold text-white">Face Not Visible</p>
            <p className="mt-2 text-sm text-white/80 max-w-sm mx-auto">{recordingError}</p>
            <button
              onClick={onRecordAgain}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-3 text-white font-bold transition hover:bg-red-700 active:scale-95 shadow-lg shadow-red-500/30"
            >
              <Video size={18} />
              Record Again
            </button>
          </div>
        )}
        {/* Script strip (full text, scrollable) */}
        {declaration ? (
          <div className="absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-3">
            <div className="rounded-xl bg-black/80 p-3 text-center backdrop-blur-md">
              <div className="flex items-center justify-between">
                <div className="text-left">
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/60">
                    Verification Code
                  </p>
                  <p className="text-2xl font-black tracking-widest text-white">
                    {declaration.runtimeCode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => speakText(`My name is ${declaration.declarantFullName}, and my code is ${declaration.runtimeCode}.`)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition active:scale-95"
                  aria-label="Listen to script"
                >
                  <Volume2 size={14} />
                </button>
              </div>
              <div className="mt-2 border-t border-white/10 pt-2 text-left">
                <p className="text-[11px] font-medium text-white/90 leading-snug">
                  "My name is {declaration.declarantFullName}, and my code is {declaration.runtimeCode}."
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Video element */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Bottom record button strip */}
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-center bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pb-5">
          <RecordButton
            isRecording={isRecording}
            disabled={!canStartRecording && !isRecording}
            onStart={startRecording}
            onStop={stopRecording}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * iPhone-camera-style record button.
 * - Idle: outer ring + large red dot inside
 * - Recording: red rounded square
 * Tap toggles between start / stop.
 */
function RecordButton({ isRecording, disabled, onStart, onStop }) {
  function handleClick() {
    if (disabled) return;
    if (isRecording) onStop();
    else onStart();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={isRecording ? "Stop recording" : "Start recording"}
      className={`relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-white transition active:scale-95 ${
        disabled
          ? "opacity-40"
          : isRecording
            ? ""
            : "hover:scale-105"
      }`}
    >
      <span
        className={`block transition-all duration-200 ${
          isRecording
            ? "h-7 w-7 rounded-[6px] bg-red-500"
            : "h-14 w-14 rounded-full bg-red-500"
        }`}
      />
    </button>
  );
}

function VideoPreviewStep({
  t,
  previewUrl,
  qualitySnapshot,
  durationSeconds,
  retake,
  submitVideo,
  isSubmitting,
  canSubmit,
  error,
  success
}) {
  return (
    <div>
      <StatusPill status="active" label="Recording completed" />

      <h1 className="mt-7 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
        Review your video before final submit.
      </h1>

      <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
        Check your recording and quality report. You can retake before final submission.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <video
          src={previewUrl}
          controls
          className="aspect-video w-full rounded-xl border border-slate-200 bg-black object-cover"
        />

        <div className="flex flex-col justify-center rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
          {qualitySnapshot?.faceCheckPassed ? (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 size={32} />
              </div>
              <p className="mt-4 text-lg font-bold text-navy">Quality Passed</p>
              <p className="mt-2 text-sm text-slate-500">Your video looks good. You can submit it now.</p>
            </>
          ) : (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
                <UserRound size={32} />
              </div>
              <p className="mt-4 text-lg font-bold text-navy">Face Not Clear</p>
              <p className="mt-2 text-sm text-slate-500">
                We couldn't see your face clearly. Please try again and keep your face inside the circle.
              </p>
            </>
          )}
        </div>
      </div>

      {success && (
        <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
          {success}
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={submitVideo}
          disabled={!canSubmit || isSubmitting}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-100 transition hover:-translate-y-0.5 hover:bg-emerald-700 disabled:bg-gray-300"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" size={17} />
              {t.submitting}
            </>
          ) : (
            <>
              <Send size={17} />
              {t.submit}
            </>
          )}
        </button>

        <button
          type="button"
          onClick={retake}
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700"
        >
          <RotateCcw size={17} />
          {t.retake}
        </button>
      </div>
    </div>
  );
}

function VideoDoneStep({ t, onBack }) {
  return (
    <div className="text-center py-6">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
        <CheckCircle2 size={28} />
      </div>

      <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em] text-navy">
        {t.completedTitle}
      </h1>

      <p className="mt-4 mx-auto max-w-xl text-sm leading-7 text-slate-500">
        {t.completedText}
      </p>

      <div className="mt-6 mx-auto max-w-sm rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Current stage
        </p>
        <p className="mt-2 text-sm font-semibold text-navy text-center">
          buyer submission completed
        </p>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-8 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700"
      >
        <ArrowLeft size={16} />
        {t.back}
      </button>
    </div>
  );
}

function ScriptOverlay({ declaration }) {
  if (!declaration) return null;

  return (
    <div className="absolute left-4 right-4 top-4 z-10 rounded-2xl border border-white/30 bg-black/70 p-4 text-white shadow-2xl backdrop-blur-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">
            Read clearly on camera
          </p>

          <p className="mt-2 text-sm leading-6 text-white">
            {declaration.scriptText}
          </p>
        </div>

        <div className="shrink-0 rounded-2xl bg-white px-4 py-3 text-center text-navy">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Code
          </p>
          <p className="mt-1 text-2xl font-black tracking-[0.16em]">
            {declaration.runtimeCode}
          </p>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 sm:text-xs">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-navy outline-none transition focus:border-gray-400 sm:mt-2 sm:rounded-2xl sm:px-4 sm:py-3"
      />
    </label>
  );
}

function CheckItem({ label, ok }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${
        ok ? "bg-emerald-50 text-emerald-700" : "bg-white text-slate-500"
      }`}
    >
      {ok ? <CheckCircle2 size={15} /> : <RefreshCcw size={15} />}
      {label}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-navy">{value}</p>
    </div>
  );
}

function getSupportedMimeType() {
  const types = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm"
  ];

  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function analyzeFaceFrame({ detections, video, canvas, prevBoxRef }) {
  const faceCount = detections.length;

  const base = {
    faceCount,
    hasOneFace: faceCount >= 1,
    centered: false,
    goodSize: false,
    lightingOk: false,
    stable: false,
    isGood: false
  };

  if (faceCount === 0) {
    return base;
  }

  let largestDetection = detections[0];
  let maxArea = largestDetection.boundingBox.width * largestDetection.boundingBox.height;

  for (let i = 1; i < detections.length; i++) {
    const d = detections[i];
    const b = d.boundingBox;
    const area = b.width * b.height;
    if (area > maxArea) {
      maxArea = area;
      largestDetection = d;
    }
  }

  const score = largestDetection.categories?.[0]?.score ?? 1;

  if (score < 0.85) {
    return { ...base, faceCount: 0 };
  }

  const box = largestDetection.boundingBox;

  const videoWidth = video.videoWidth || 640;
  const videoHeight = video.videoHeight || 480;

  const centerX = (box.originX + box.width / 2) / videoWidth;
  const centerY = (box.originY + box.height / 2) / videoHeight;
  const widthRatio = box.width / videoWidth;
  const heightRatio = box.height / videoHeight;

  const centered =
    centerX >= 0.28 && centerX <= 0.72 && centerY >= 0.22 && centerY <= 0.78;

  const goodSize =
    widthRatio >= 0.16 &&
    widthRatio <= 0.62 &&
    heightRatio >= 0.18 &&
    heightRatio <= 0.72;

  const brightness = calculateBrightness(video, canvas);
  const lightingOk = brightness >= 45 && brightness <= 225;

  const previous = prevBoxRef.current;

  const movement = previous
    ? Math.hypot(centerX - previous.centerX, centerY - previous.centerY)
    : 0;

  const stable = !previous || movement <= 0.08;

  prevBoxRef.current = {
    centerX,
    centerY,
    widthRatio,
    heightRatio
  };

  return {
    ...base,
    centered,
    goodSize,
    lightingOk,
    stable,
    isGood: centered && goodSize && lightingOk && stable
  };
}

function calculateBrightness(video, canvas) {
  try {
    if (!canvas) return 128;

    const width = 64;
    const height = 36;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    ctx.drawImage(video, 0, 0, width, height);

    const frame = ctx.getImageData(0, 0, width, height).data;

    let total = 0;

    for (let i = 0; i < frame.length; i += 4) {
      total += 0.2126 * frame[i] + 0.7152 * frame[i + 1] + 0.0722 * frame[i + 2];
    }

    return total / (frame.length / 4);
  } catch {
    return 128;
  }
}

function getFaceMessage(face) {
  if (face.faceCount === 0) return "No face detected. Please face the camera.";
  if (!face.centered) return "Move your face to the center of the frame.";
  if (!face.goodSize) return "Move slightly closer or farther from the camera.";
  if (!face.lightingOk) return "Improve lighting. Avoid too much darkness or glare.";
  if (!face.stable) return "Hold your face steady.";
  if (!face.ready) return "Good. Keep your face steady for 2 seconds.";
  return "Face readiness check passed. You can start recording.";
}

function LiveCameraFrame({ videoRef, canvasRef, declaration, showScript, faceState, recordingError, onRecordAgain }) {
  // 3:4 (portrait) on mobile so the user can see their face below the script.
  // 16:9 (landscape) on sm+ screens so script + code sit beside the face.
  // On mobile, the script is rendered OUTSIDE the frame (in <ScriptPrompt />)
  // so the full text is readable. On sm+, a small overlay still floats on top.
  const borderColor = faceState?.ready ? "border-emerald-500" : "border-red-500";

  return (
    <div className={`mx-auto mt-6 w-full max-w-3xl overflow-hidden rounded-xl border-4 bg-gray-950 shadow-xl shadow-gray-200/60 transition-colors duration-300 ${borderColor}`}>
      <div className="relative aspect-[3/4] min-h-[420px] sm:aspect-video sm:min-h-0">
        {recordingError && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-6 text-center backdrop-blur-sm">
            <UserRound size={48} className="text-red-500 mb-4" />
            <p className="text-xl font-bold text-white">Face Not Visible</p>
            <p className="mt-2 text-sm text-white/80 max-w-sm mx-auto">{recordingError}</p>
            <button
              onClick={onRecordAgain}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-3 text-white font-bold transition hover:bg-red-700 active:scale-95 shadow-lg shadow-red-500/30"
            >
              <Video size={18} />
              Record Again
            </button>
          </div>
        )}
        {showScript && declaration && (
          <>
            {/* Teleprompter overlay only on sm+; mobile uses ScriptPrompt above */}
            <div className="hidden sm:block">
              <CompactScriptOverlay declaration={declaration} />
            </div>
          </>
        )}

        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}

function speakText(text) {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }
}

/**
 * Mobile-first script prompt — full text visible, big code badge.
 * Renders above the camera frame on mobile, beside it on sm+.
 */
function ScriptPrompt({ declaration }) {
  if (!declaration) return null;
  const promptText = `My name is ${declaration.declarantFullName}, and my code is ${declaration.runtimeCode}.`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
        Your Verification Code
      </p>
      <p className="mt-2 text-5xl font-black tracking-[0.2em] text-navy">
        {declaration.runtimeCode}
      </p>

      <div className="mt-6 flex flex-col items-center justify-center gap-4 border-t border-slate-100 pt-5 sm:flex-row">
        <p className="text-lg font-medium text-slate-700 leading-relaxed">
          "{promptText}"
        </p>
        <button
          type="button"
          onClick={() => speakText(promptText)}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 transition hover:bg-blue-100 active:scale-95"
          aria-label="Listen to script"
        >
          <Volume2 size={22} />
        </button>
      </div>
    </div>
  );
}

function CompactScriptOverlay({ declaration }) {
  if (!declaration) return null;
  const promptText = `My name is ${declaration.declarantFullName}, and my code is ${declaration.runtimeCode}.`;

  return (
    <div className="absolute left-3 right-3 top-3 z-20 flex flex-col sm:flex-row items-center justify-start gap-4 sm:gap-6 rounded-xl border border-white/20 bg-black/80 px-4 py-3 text-white shadow-2xl backdrop-blur-md sm:left-4 sm:right-4 sm:top-4">
      <div className="shrink-0 text-center sm:text-left">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/60">
          Verification Code
        </p>
        <p className="mt-0.5 text-2xl font-black tracking-widest sm:text-3xl">
          {declaration.runtimeCode}
        </p>
      </div>

      {/* Vertical divider on desktop */}
      <div className="hidden h-10 w-px bg-white/10 sm:block" />

      <div className="mt-2 flex flex-1 items-center gap-3 border-t border-white/10 pt-2 w-full sm:w-auto sm:mt-0 sm:border-none sm:pt-0">
        <p className="flex-1 text-center text-sm font-medium leading-snug text-white/90 sm:text-left">
          "{promptText}"
        </p>
        <button
          type="button"
          onClick={() => speakText(promptText)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-95"
          aria-label="Listen to script"
        >
          <Volume2 size={14} />
        </button>
      </div>
    </div>
  );
}
