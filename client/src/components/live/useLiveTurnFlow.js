import { useEffect, useRef, useState } from "react";
import {
  prefetchBothTranscriptionSecrets,
  SECRET_REFRESH_INTERVAL_MS,
  useLiveConversationCapture,
} from "./useLiveConversationCapture.js";

function mapCaptureStatus(status) {
  if (status === "starting") {
    return "starting";
  }

  if (
    status === "listening" ||
    status === "processing"
  ) {
    return "recording";
  }

  if (status === "stopping") {
    return "processing";
  }

  return "idle";
}

export function useLiveTurnFlow({
  myLang,
  theirLang,
  originMode,
  captureState,
  setCaptureState,
  authFetch,
  onLiveTranscriptDelta,
  onLiveTranscript,
  onLiveCaptureClosed,
  onBeforeCapture,
}) {
  const runRef = useRef(null);
  const [currentRun, setCurrentRun] = useState(null);
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [localError, setLocalError] = useState("");
  const onLiveCaptureClosedRef = useRef(onLiveCaptureClosed);
  const onBeforeCaptureRef = useRef(onBeforeCapture);

  useEffect(() => {
    onLiveCaptureClosedRef.current = onLiveCaptureClosed;
  }, [onLiveCaptureClosed]);

  useEffect(() => {
    onBeforeCaptureRef.current = onBeforeCapture;
  }, [onBeforeCapture]);

  // Warm up OpenAI Realtime transcription client secrets and HTTPS socket in both directions as soon as the screen
  // is mounted/visible, and refresh them periodically so tapping the mic never waits for an expired token roundtrip.
  useEffect(() => {
    const isVisible = () =>
      typeof document === "undefined" || document.visibilityState === "visible";

    if (!isVisible() || !myLang || !theirLang) {
      return;
    }

    prefetchBothTranscriptionSecrets({ myLang, theirLang, authFetch });

    const handleVisibilityChange = () => {
      if (isVisible()) {
        prefetchBothTranscriptionSecrets({ myLang, theirLang, authFetch });
      }
    };

    const refreshTimer = setInterval(() => {
      if (isVisible()) {
        prefetchBothTranscriptionSecrets({ myLang, theirLang, authFetch });
      }
    }, SECRET_REFRESH_INTERVAL_MS);

    if (
      typeof document !== "undefined" &&
      typeof document.addEventListener === "function"
    ) {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      clearInterval(refreshTimer);
      if (
        typeof document !== "undefined" &&
        typeof document.removeEventListener === "function"
      ) {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [myLang, theirLang, authFetch]);

  const { startListening, stopListening } = useLiveConversationCapture({
    myLang,
    theirLang,
    setCaptureState,
    authFetch,
    onLiveTranscriptDelta: (payload) => {
      if (payload.itemId) {
        setActiveMessageId(payload.itemId);
      }

      onLiveTranscriptDelta?.({
        ...payload,
        originMode,
        speaker: payload.speaker ?? runRef.current?.speaker,
        sender:
          payload.speaker === "top"
            ? "partner"
            : payload.speaker === "bottom"
              ? "self"
              : payload.sender ?? runRef.current?.sender ?? "self",
      });
    },
    onLiveTranscript: (payload) => {
      if (payload.itemId) {
        setActiveMessageId(payload.itemId);
      }

      onLiveTranscript?.({
        ...payload,
        originMode,
        speaker: payload.speaker ?? runRef.current?.speaker,
        sender:
          payload.speaker === "top"
            ? "partner"
            : payload.speaker === "bottom"
              ? "self"
              : payload.sender ?? runRef.current?.sender ?? "self",
      });
    },
  });

  useEffect(() => {
    if (captureState.status === "error") {
      setLocalError(captureState.lastError ?? "Live transcription failed.");
    }

    if (
      (captureState.status === "idle" || captureState.status === "error") &&
      runRef.current
    ) {
      runRef.current = null;
      setCurrentRun(null);
    }
  }, [captureState.status, captureState.lastError]);

  useEffect(() => {
    return () => {
      runRef.current = null;
      onLiveCaptureClosedRef.current?.();
    };
  }, []);

  const startRecording = async (run) => {
    if (
      runRef.current ||
      captureState.status === "starting" ||
      captureState.status === "listening" ||
      captureState.status === "processing" ||
      captureState.status === "stopping"
    ) {
      return;
    }

    onBeforeCaptureRef.current?.();

    const nextRun = { ...run };
    runRef.current = nextRun;
    setCurrentRun(nextRun);
    setLocalError("");

    await startListening({
      sourceLanguage: nextRun.sourceLanguage,
      targetLanguage: nextRun.targetLanguage,
      sender: nextRun.sender,
      speaker: nextRun.speaker,
    });
  };

  const stopRecording = () => {
    if (!runRef.current) {
      return;
    }

    stopListening();
  };

  return {
    status: mapCaptureStatus(captureState.status),
    error: localError || captureState.lastError || "",
    currentRun,
    activeMessageId,
    startRecording,
    stopRecording,
    setActiveMessageId,
    clearError: () => setLocalError(""),
  };
}
