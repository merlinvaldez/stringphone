import { useEffect, useRef, useState } from "react";
import { useLiveConversationCapture } from "./useLiveConversationCapture.js";

function mapCaptureStatus(status) {
  if (
    status === "starting" ||
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
}) {
  const runRef = useRef(null);
  const [currentRun, setCurrentRun] = useState(null);
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [localError, setLocalError] = useState("");
  const onLiveCaptureClosedRef = useRef(onLiveCaptureClosed);

  useEffect(() => {
    onLiveCaptureClosedRef.current = onLiveCaptureClosed;
  }, [onLiveCaptureClosed]);

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
