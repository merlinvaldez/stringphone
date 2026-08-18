import { useEffect, useRef } from "react";

const SILENCE_FINALIZE_MS = 1000;
const MAX_SEGMENT_MS = 10000;
const MIN_SEGMENT_MS = 550;
const MIN_SEGMENT_BYTES = 1200;
const SPEECH_RMS_THRESHOLD = 0.018;

function getSupportedLiveMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];

  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function calculateRms(samples) {
  let sum = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const normalized = (samples[index] - 128) / 128;
    sum += normalized * normalized;
  }

  return Math.sqrt(sum / samples.length);
}

export function useLiveConversationCapture({
  myLang,
  theirLang,
  captureState,
  setCaptureState,
  onLiveSegment,
}) {
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const monitorFrameRef = useRef(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const segmentStartedAtRef = useRef("");
  const segmentStartedMsRef = useRef(0);
  const lastSpeechMsRef = useRef(0);
  const segmentPeakRmsRef = useRef(0);
  const isListeningRef = useRef(false);
  const latestLanguagesRef = useRef({ myLang, theirLang });

  useEffect(() => {
    latestLanguagesRef.current = { myLang, theirLang };
  }, [myLang, theirLang]);

  const patchCaptureState = (patch) => {
    setCaptureState((previousState) => ({
      ...previousState,
      ...(typeof patch === "function" ? patch(previousState) : patch),
    }));
  };

  const stopMonitoring = () => {
    if (monitorFrameRef.current) {
      cancelAnimationFrame(monitorFrameRef.current);
      monitorFrameRef.current = 0;
    }
  };

  const closeStream = async () => {
    stopMonitoring();

    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    analyserRef.current = null;
  };

  const finalizeActiveSegment = () => {
    const recorder = recorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      return;
    }

    recorder.stop();
  };

  const startSegmentRecorder = () => {
    if (!streamRef.current || recorderRef.current?.state === "recording") {
      return;
    }

    chunksRef.current = [];
    segmentPeakRmsRef.current = 0;
    segmentStartedMsRef.current = performance.now();
    segmentStartedAtRef.current = new Date().toISOString();
    lastSpeechMsRef.current = segmentStartedMsRef.current;

    const mimeType = getSupportedLiveMimeType();
    const recorder = new MediaRecorder(
      streamRef.current,
      mimeType ? { mimeType } : undefined,
    );

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const chunks = chunksRef.current;
      const durationMs = performance.now() - segmentStartedMsRef.current;
      const bytes = chunks.reduce((total, chunk) => total + chunk.size, 0);
      const segmentStartedAt = segmentStartedAtRef.current;
      const segmentEndedAt = new Date().toISOString();
      recorderRef.current = null;
      chunksRef.current = [];

      if (
        durationMs < MIN_SEGMENT_MS ||
        bytes < MIN_SEGMENT_BYTES ||
        segmentPeakRmsRef.current < SPEECH_RMS_THRESHOLD
      ) {
        return;
      }

      const audioBlob = new Blob(chunks, {
        type: recorder.mimeType || "audio/webm",
      });

      onLiveSegment({
        audioBlob,
        sourceLanguage: latestLanguagesRef.current.myLang,
        targetLanguage: latestLanguagesRef.current.theirLang,
        segmentStartedAt,
        segmentEndedAt,
      });
    };

    recorderRef.current = recorder;
    recorder.start(250);
  };

  const monitorAudio = () => {
    const analyser = analyserRef.current;

    if (!isListeningRef.current || !analyser) {
      return;
    }

    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);
    const rms = calculateRms(samples);
    const now = performance.now();
    const hasSpeech = rms >= SPEECH_RMS_THRESHOLD;

    if (hasSpeech) {
      lastSpeechMsRef.current = now;
      segmentPeakRmsRef.current = Math.max(segmentPeakRmsRef.current, rms);
      startSegmentRecorder();
    }

    if (recorderRef.current?.state === "recording") {
      const segmentDuration = now - segmentStartedMsRef.current;
      const silenceDuration = now - lastSpeechMsRef.current;

      if (
        segmentDuration >= MAX_SEGMENT_MS ||
        (segmentDuration >= MIN_SEGMENT_MS &&
          silenceDuration >= SILENCE_FINALIZE_MS)
      ) {
        finalizeActiveSegment();
      }
    }

    monitorFrameRef.current = requestAnimationFrame(monitorAudio);
  };

  const startListening = async () => {
    if (isListeningRef.current) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      patchCaptureState({
        status: "error",
        lastError: "This browser does not support audio recording.",
      });
      return;
    }

    try {
      patchCaptureState({
        status: "starting",
        lastError: "",
        sessionStartedAt: new Date().toISOString(),
      });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();

      analyser.fftSize = 1024;
      source.connect(analyser);
      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      isListeningRef.current = true;
      patchCaptureState({
        status: "listening",
        lastError: "",
      });
      monitorFrameRef.current = requestAnimationFrame(monitorAudio);
    } catch (error) {
      isListeningRef.current = false;
      await closeStream();
      patchCaptureState({
        status: "error",
        sessionStartedAt: null,
        activeSegmentId: null,
        lastError:
          error instanceof Error && error.message
            ? error.message
            : "Microphone permission was denied.",
      });
    }
  };

  const stopListening = async () => {
    if (!isListeningRef.current && captureState?.status !== "listening") {
      return;
    }

    patchCaptureState({ status: "stopping" });
    isListeningRef.current = false;
    finalizeActiveSegment();
    await closeStream();
    patchCaptureState({
      status: "idle",
      sessionStartedAt: null,
      activeSegmentId: null,
    });
  };

  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      finalizeActiveSegment();
      void closeStream();
      patchCaptureState({
        status: "idle",
        sessionStartedAt: null,
        activeSegmentId: null,
      });
    };
  }, []);

  return {
    startListening,
    stopListening,
  };
}
