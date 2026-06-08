import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  CircleStop,
  FileVideo,
  Loader2,
  Mic,
  RefreshCcw,
  RotateCcw,
  Send,
  ShieldCheck,
  UserRound,
  Video
} from "lucide-react";
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

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
  onBack
}) {
  const t = content[language] || content.en;

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const detectorRef = useRef(null);
  const detectionTimerRef = useRef(null);
  const prevBoxRef = useRef(null);
  const consecutiveGoodRef = useRef(0);
  const recordingRef = useRef(false);
  const recordingStartedAtRef = useRef(null);

  const statsRef = useRef({
    checks: 0,
    faceVisibleCount: 0,
    singleFaceCount: 0,
    centeredCount: 0,
    goodSizeCount: 0,
    lightingOkCount: 0,
    stableCount: 0,
    goodFrameCount: 0,
    multipleFaceCount: 0
  });

  const [workspace, setWorkspace] = useState(null);
  const [declaration, setDeclaration] = useState(null);
  const [screen, setScreen] = useState("details");

  const [form, setForm] = useState({
    declarantFullName: "",
    declarantRole: "",
    businessName: buyerName || "",
    language
  });

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

  const isSubmitted =
    workspace?.kyc?.overallStatus === "submitted" ||
    declaration?.status === "submitted";

  const canStartRecording = faceState.ready && !isRecording && !recordedBlob;
  const canSubmit = recordedBlob && qualitySnapshot?.faceCheckPassed;

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
      faceVisibleRatio >= 0.65 &&
      singleFaceRatio >= 0.75 &&
      centeredRatio >= 0.5 &&
      goodSizeRatio >= 0.5 &&
      lightingOkRatio >= 0.45 &&
      stableRatio >= 0.45 &&
      stats.multipleFaceCount <= 1;

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

      if (result.declaration) {
        if (result.declaration.status === "submitted") {
          setScreen("done");
        } else {
          setScreen("camera");
        }
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

  useEffect(() => {
    if ((screen === "camera" || screen === "recording") && streamRef.current) {
      setTimeout(() => {
        attachStreamToVideo();
      }, 100);
    }
  }, [screen]);

  useEffect(() => {
    loadWorkspace();

    return () => {
      stopCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (isSubmitted) {
      setScreen("done");
    }
  }, [isSubmitted]);

  async function handleGenerateScript() {
    try {
      setIsGenerating(true);
      setError("");
      setSuccess("");

      const result = await startKycVideoDeclaration(token, {
        ...form,
        language
      });

      if (!result.success) {
        setError(result.message || "Unable to generate declaration script.");
        return;
      }

      setDeclaration(result.declaration);
      setSuccess("Declaration script generated successfully.");
      setScreen("camera");
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
      setError(
        err?.message ||
          "Unable to access camera/microphone. Please allow permissions."
      );
    } finally {
      setIsCameraStarting(false);
    }
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

      setRecordedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setDurationSeconds(duration);
      setQualitySnapshot(snapshot);
      setSuccess(
        snapshot.faceCheckPassed
          ? "Recording completed. Preview and submit your declaration."
          : "Recording completed, but quality check is weak. Please retake."
      );

      recordingRef.current = false;
      setIsRecording(false);
      setScreen("preview");
      stopCamera();
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

      const result = await uploadKycVideoDeclaration(token, formData);

      if (!result.success) {
        setError(result.message || "Unable to submit video declaration.");
        return;
      }

      setDeclaration(result.declaration);
      setSuccess("Video declaration submitted successfully.");
      setScreen("done");
      await loadWorkspace();
      stopCamera();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          "Unable to submit video declaration. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-[2.5rem] border border-white/80 bg-white/90 p-6 shadow-xl shadow-gray-200/70 backdrop-blur-xl sm:p-8 lg:p-10">
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
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status="active" label="Documents completed" />
        <StatusPill status="pending" label="Video pending" />
      </div>

      <h1 className="mt-7 text-3xl font-semibold tracking-[-0.03em] text-gray-950 sm:text-4xl">
        Authorized person details
      </h1>

      <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-500">
        Enter the person details. Backend will generate a unique script and runtime code.
      </p>

      <div className="mt-8 max-w-2xl space-y-4">
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

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={handleGenerateScript}
          disabled={isGenerating}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-950 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-gray-300 transition hover:-translate-y-0.5 hover:bg-black disabled:bg-gray-300"
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
          className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-6 py-3.5 text-sm font-semibold text-gray-700"
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

      <h1 className="mt-7 text-3xl font-semibold tracking-[-0.03em] text-gray-950 sm:text-4xl">
        Camera readiness check
      </h1>

      <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-500">
        Align your face in the center. We need a steady, clear picture to start recording.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <LiveCameraFrame
            videoRef={videoRef}
            canvasRef={canvasRef}
            declaration={declaration}
            showScript={false}
          />
        </div>

        <div className="rounded-[2rem] border border-gray-100 bg-gray-50 p-5">
          <p className="text-sm font-semibold text-gray-950">
            Status: {faceState.message}
          </p>

          <div className="mt-5 space-y-2">
            <CheckItem label="Exactly one face" ok={faceState.hasOneFace} />
            <CheckItem label="Face centered" ok={faceState.centered} />
            <CheckItem label="Good face size" ok={faceState.goodSize} />
            <CheckItem label="Lighting okay" ok={faceState.lightingOk} />
            <CheckItem label="Face stable" ok={faceState.stable} />
            <CheckItem
              label="Stable for 2 seconds"
              ok={faceState.consecutiveGoodChecks >= 3}
            />
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={startCamera}
          disabled={isCameraStarting}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-6 py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-950 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-gray-300 hover:bg-black disabled:bg-gray-300 disabled:shadow-none"
        >
          Continue to recording
          <ArrowRight size={17} />
        </button>

        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-6 py-3.5 text-sm font-semibold text-gray-700"
        >
          <ArrowLeft size={17} />
          {t.back}
        </button>
      </div>
    </div>
  );
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
  onBack
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status="active" label="Camera ready" />
        <StatusPill status="pending" label={isRecording ? "Recording" : "Ready to record"} />
      </div>

      <h1 className="mt-7 text-3xl font-semibold tracking-[-0.03em] text-gray-950 sm:text-4xl">
        Record your video declaration
      </h1>

      <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-500">
        Click Start Recording, then read the script at the top of the video. Make sure to read the runtime verification code clearly.
      </p>

      <LiveCameraFrame
        videoRef={videoRef}
        canvasRef={canvasRef}
        declaration={declaration}
        showScript={true}
      />

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
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
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-950 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-gray-300 transition hover:-translate-y-0.5 hover:bg-black"
          >
            <CircleStop size={17} />
            {t.stopRecording}
          </button>
        )}

        <button
          type="button"
          onClick={onBack}
          disabled={isRecording}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-6 py-3.5 text-sm font-semibold text-gray-700 disabled:opacity-50"
        >
          <ArrowLeft size={17} />
          {t.back}
        </button>
      </div>
    </div>
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

      <h1 className="mt-7 text-3xl font-semibold tracking-[-0.03em] text-gray-950 sm:text-4xl">
        Review your video before final submit.
      </h1>

      <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-500">
        Check your recording and quality report. You can retake before final submission.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <video
          src={previewUrl}
          controls
          className="aspect-video w-full rounded-[2rem] border border-gray-100 bg-black object-cover"
        />

        <div className="rounded-[2rem] border border-gray-100 bg-gray-50 p-5">
          <p className="text-sm font-semibold text-gray-950">
            Quality report
          </p>

          <div className="mt-4 grid gap-3">
            <MiniStat label="Duration" value={`${durationSeconds}s`} />
            <MiniStat
              label="Face visible"
              value={`${Math.round((qualitySnapshot?.faceVisibleRatio || 0) * 100)}%`}
            />
            <MiniStat
              label="Single face"
              value={`${Math.round((qualitySnapshot?.singleFaceRatio || 0) * 100)}%`}
            />
            <MiniStat
              label="Centered"
              value={`${Math.round((qualitySnapshot?.centeredRatio || 0) * 100)}%`}
            />
          </div>

          <div className="mt-5">
            <StatusPill
              status={qualitySnapshot?.faceCheckPassed ? "active" : "expired"}
              label={
                qualitySnapshot?.faceCheckPassed
                  ? "Quality passed"
                  : "Retake recommended"
              }
            />
          </div>
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
          className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-6 py-3.5 text-sm font-semibold text-gray-700"
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
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        <CheckCircle2 size={28} />
      </div>

      <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em] text-gray-950">
        {t.completedTitle}
      </h1>

      <p className="mt-4 mx-auto max-w-xl text-sm leading-7 text-gray-500">
        {t.completedText}
      </p>

      <div className="mt-6 mx-auto max-w-sm rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
          Current stage
        </p>
        <p className="mt-2 text-sm font-semibold text-gray-950 text-center">
          buyer submission completed
        </p>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-8 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700"
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

        <div className="shrink-0 rounded-2xl bg-white px-4 py-3 text-center text-gray-950">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
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
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-950 outline-none transition focus:border-gray-400"
      />
    </label>
  );
}

function CheckItem({ label, ok }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${
        ok ? "bg-emerald-50 text-emerald-700" : "bg-white text-gray-500"
      }`}
    >
      {ok ? <CheckCircle2 size={15} /> : <RefreshCcw size={15} />}
      {label}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-gray-950">{value}</p>
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
    hasOneFace: faceCount === 1,
    centered: false,
    goodSize: false,
    lightingOk: false,
    stable: false,
    isGood: false
  };

  if (faceCount !== 1) {
    return base;
  }

  const box = detections[0].boundingBox;

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
  if (face.faceCount > 1) return "Multiple faces detected. Only one person should be visible.";
  if (!face.centered) return "Move your face to the center of the frame.";
  if (!face.goodSize) return "Move slightly closer or farther from the camera.";
  if (!face.lightingOk) return "Improve lighting. Avoid too much darkness or glare.";
  if (!face.stable) return "Hold your face steady.";
  if (!face.ready) return "Good. Keep your face steady for 2 seconds.";
  return "Face readiness check passed. You can start recording.";
}

function LiveCameraFrame({ videoRef, canvasRef, declaration, showScript }) {
  return (
    <div className="mx-auto mt-6 w-full max-w-3xl overflow-hidden rounded-[2rem] border border-gray-100 bg-gray-950 shadow-xl shadow-gray-200/60">
      <div className="relative aspect-video">
        {showScript && declaration && (
          <CompactScriptOverlay declaration={declaration} />
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

function CompactScriptOverlay({ declaration }) {
  return (
    <div className="absolute left-4 right-4 top-4 z-10 rounded-2xl border border-white/20 bg-black/70 p-3 text-white shadow-2xl backdrop-blur-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
            Read clearly
          </p>

          <p className="mt-1 line-clamp-3 text-sm leading-6 text-white">
            {declaration.scriptText}
          </p>
        </div>

        <div className="shrink-0 rounded-xl bg-white px-4 py-2 text-center text-gray-950">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-400">
            Code
          </p>
          <p className="mt-1 text-xl font-black tracking-[0.16em]">
            {declaration.runtimeCode}
          </p>
        </div>
      </div>
    </div>
  );
}
