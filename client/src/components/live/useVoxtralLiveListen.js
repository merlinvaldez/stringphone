import { useCallback, useEffect, useRef, useState } from "react";

export const LIVE_LISTEN_VAD_DEFAULTS = {
  speechRmsThreshold: 0.018,
  minSpeechMs: 550,
  silenceFinalizeMs: 750,
  maxChunkMs: 6000,
  previewIntervalMs: 2500,
  idleRolloverMs: 2500,
};

function resolveSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

/**
 * Pure VAD chunking and echo-gating state machine shared between the Web hook
 * and offline Node unit tests.
 */
export function createVadChunkController(options = {}) {
  const speechRmsThreshold =
    options.speechRmsThreshold ?? LIVE_LISTEN_VAD_DEFAULTS.speechRmsThreshold;
  const minSpeechMs = options.minSpeechMs ?? LIVE_LISTEN_VAD_DEFAULTS.minSpeechMs;
  const silenceFinalizeMs =
    options.silenceFinalizeMs ?? LIVE_LISTEN_VAD_DEFAULTS.silenceFinalizeMs;
  const maxChunkMs = options.maxChunkMs ?? LIVE_LISTEN_VAD_DEFAULTS.maxChunkMs;
  const previewIntervalMs =
    options.previewIntervalMs ?? LIVE_LISTEN_VAD_DEFAULTS.previewIntervalMs;

  let speechStartMs = null;
  let lastSpeechMs = null;
  let previewEmitted = false;

  const reset = () => {
    speechStartMs = null;
    lastSpeechMs = null;
    previewEmitted = false;
  };

  const processFrame = ({
    rms = 0,
    nowMs = Date.now(),
    isLocalAudioPlaying = false,
    headphoneMode = false,
  }) => {
    if (isLocalAudioPlaying && !headphoneMode) {
      if (speechStartMs !== null) {
        const currentSpeechDuration =
          (lastSpeechMs ?? nowMs) - speechStartMs;
        if (currentSpeechDuration >= minSpeechMs) {
          reset();
          return {
            action: "finalize",
            reason: "playback_gate",
            speechDurationMs: currentSpeechDuration,
          };
        }
        reset();
      }
      return { action: "none", speechDurationMs: 0 };
    }

    if (rms >= speechRmsThreshold) {
      if (speechStartMs === null) {
        speechStartMs = nowMs;
        previewEmitted = false;
      }
      lastSpeechMs = nowMs;
      const speechDurationMs = nowMs - speechStartMs;

      if (speechDurationMs >= maxChunkMs) {
        reset();
        return {
          action: "finalize",
          reason: "max_duration",
          speechDurationMs,
        };
      }

      if (!previewEmitted && speechDurationMs >= previewIntervalMs) {
        previewEmitted = true;
        return {
          action: "preview",
          speechDurationMs,
        };
      }

      return { action: "none", speechDurationMs };
    }

    if (speechStartMs === null) {
      return { action: "none", speechDurationMs: 0 };
    }

    const activeSpeechEnd = lastSpeechMs ?? speechStartMs;
    const speechDurationMs = Math.max(0, activeSpeechEnd - speechStartMs);
    const silenceDurationMs = Math.max(0, nowMs - activeSpeechEnd);

    if (silenceDurationMs >= silenceFinalizeMs) {
      reset();
      if (speechDurationMs >= minSpeechMs) {
        return {
          action: "finalize",
          reason: "silence",
          speechDurationMs,
        };
      }
      return { action: "discard_noise", speechDurationMs };
    }

    if (nowMs - speechStartMs >= maxChunkMs && speechDurationMs >= minSpeechMs) {
      reset();
      return {
        action: "finalize",
        reason: "max_duration",
        speechDurationMs,
      };
    }

    return { action: "none", speechDurationMs };
  };

  const getState = () => ({
    isSpeaking: speechStartMs !== null,
    speechStartMs,
    lastSpeechMs,
    previewEmitted,
  });

  return {
    processFrame,
    reset,
    getState,
  };
}

export function useVoxtralLiveListen({
  isLocalAudioPlaying = false,
  headphoneMode = false,
  onChunkReady,
  onPreviewReady,
  onError,
  onBeforeStart,
} = {}) {
  const [status, setStatus] = useState("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const isLocalPlayingRef = useRef(isLocalAudioPlaying);
  const headphoneModeRef = useRef(headphoneMode);
  const onChunkReadyRef = useRef(onChunkReady);
  const onPreviewReadyRef = useRef(onPreviewReady);
  const onErrorRef = useRef(onError);
  const onBeforeStartRef = useRef(onBeforeStart);

  useEffect(() => {
    isLocalPlayingRef.current = isLocalAudioPlaying;
  }, [isLocalAudioPlaying]);

  useEffect(() => {
    headphoneModeRef.current = headphoneMode;
  }, [headphoneMode]);

  useEffect(() => {
    onChunkReadyRef.current = onChunkReady;
  }, [onChunkReady]);

  useEffect(() => {
    onPreviewReadyRef.current = onPreviewReady;
  }, [onPreviewReady]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onBeforeStartRef.current = onBeforeStart;
  }, [onBeforeStart]);

  const activeRef = useRef(false);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recorderChunksRef = useRef([]);
  const recorderStartedAtRef = useRef(0);
  const vadControllerRef = useRef(createVadChunkController());
  const monitorTimerRef = useRef(null);
  const elapsedTimerRef = useRef(null);
  const sessionStartedAtRef = useRef(0);
  const mimeTypeRef = useRef("");

  const cleanupResources = useCallback(() => {
    activeRef.current = false;

    if (monitorTimerRef.current) {
      window.clearInterval(monitorTimerRef.current);
      monitorTimerRef.current = null;
    }

    if (elapsedTimerRef.current) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }

    const currentEntry = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (currentEntry?.recorder && currentEntry.recorder.state !== "inactive") {
      try {
        currentEntry.recorder.stop();
      } catch {
        // Ignore already-stopped recorder
      }
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    recorderChunksRef.current = [];
    vadControllerRef.current.reset();
    sessionStartedAtRef.current = 0;
  }, []);

  const startFreshRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !activeRef.current || typeof MediaRecorder === "undefined") {
      return;
    }

    const mimeType = mimeTypeRef.current || resolveSupportedMimeType();
    mimeTypeRef.current = mimeType;
    const chunks = [];
    const startedAt = Date.now();
    const stopControl = { discard: false };
    recorderChunksRef.current = chunks;
    recorderStartedAtRef.current = startedAt;

    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = () => {
      if (stopControl.discard || chunks.length === 0) {
        return;
      }

      const resolvedType = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunks, { type: resolvedType });
      if (blob.size <= 0) {
        return;
      }
      blob.durationMs = Math.max(100, Date.now() - startedAt);
      onChunkReadyRef.current?.(blob);
    };

    recorder.onerror = () => {
      onErrorRef.current?.("Microphone recorder stopped unexpectedly.");
    };

    mediaRecorderRef.current = { recorder, stopControl };
    recorder.start(250);
  }, []);

  const rotateRecorder = useCallback(
    ({ discard = false } = {}) => {
      const currentEntry = mediaRecorderRef.current;
      mediaRecorderRef.current = null;

      if (currentEntry) {
        currentEntry.stopControl.discard = discard;
        if (currentEntry.recorder.state !== "inactive") {
          try {
            currentEntry.recorder.stop();
          } catch {
            // Ignore recorder stop errors during rollover
          }
        }
      }

      if (activeRef.current) {
        startFreshRecorder();
      }
    },
    [startFreshRecorder],
  );

  const stopListening = useCallback(() => {
    const wasSpeaking = vadControllerRef.current.getState().isSpeaking;
    const currentEntry = mediaRecorderRef.current;
    if (currentEntry && currentEntry.recorder.state !== "inactive") {
      currentEntry.stopControl.discard = !wasSpeaking;
    }

    setStatus("stopping");
    cleanupResources();
    setElapsedSeconds(0);
    setStatus("idle");
  }, [cleanupResources]);

  const startListening = useCallback(async () => {
    if (activeRef.current) {
      return true;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      const message = "Microphone capture is not supported in this browser.";
      onErrorRef.current?.(message);
      setStatus("error");
      return false;
    }

    try {
      await onBeforeStartRef.current?.();
      setStatus("starting");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const AudioContextCtor =
        window.AudioContext || window.webkitAudioContext;
      if (typeof AudioContextCtor === "function") {
        const ctx = new AudioContextCtor();
        if (ctx.state === "suspended") {
          await ctx.resume().catch(() => undefined);
        }
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        audioContextRef.current = ctx;
        analyserRef.current = analyser;
      }

      activeRef.current = true;
      sessionStartedAtRef.current = Date.now();
      vadControllerRef.current.reset();
      startFreshRecorder();
      setElapsedSeconds(0);
      setStatus("listening");

      elapsedTimerRef.current = window.setInterval(() => {
        if (sessionStartedAtRef.current > 0) {
          setElapsedSeconds(
            Math.max(0, Math.floor((Date.now() - sessionStartedAtRef.current) / 1000)),
          );
        }
      }, 500);

      const pcmBuffer = analyserRef.current
        ? new Float32Array(analyserRef.current.fftSize)
        : null;

      monitorTimerRef.current = window.setInterval(() => {
        if (!activeRef.current) {
          return;
        }

        const nowMs = Date.now();
        let rms = 0;
        if (analyserRef.current && pcmBuffer) {
          analyserRef.current.getFloatTimeDomainData(pcmBuffer);
          let sumSquares = 0;
          for (let i = 0; i < pcmBuffer.length; i += 1) {
            const sample = pcmBuffer[i];
            sumSquares += sample * sample;
          }
          rms = Math.sqrt(sumSquares / pcmBuffer.length);
        }

        const decision = vadControllerRef.current.processFrame({
          rms,
          nowMs,
          isLocalAudioPlaying: isLocalPlayingRef.current,
          headphoneMode: headphoneModeRef.current,
        });

        if (decision.action === "finalize") {
          rotateRecorder({ discard: false });
          return;
        }

        if (decision.action === "discard_noise") {
          rotateRecorder({ discard: true });
          return;
        }

        if (decision.action === "preview") {
          const chunks = recorderChunksRef.current;
          if (chunks.length > 0) {
            const previewBlob = new Blob(chunks, {
              type: mimeTypeRef.current || "audio/webm",
            });
            if (previewBlob.size > 0) {
              onPreviewReadyRef.current?.(previewBlob);
            }
          }
          return;
        }

        // Prevent silent idle buffers from growing large between turns.
        const vadState = vadControllerRef.current.getState();
        if (
          !vadState.isSpeaking &&
          recorderStartedAtRef.current > 0 &&
          nowMs - recorderStartedAtRef.current >=
            LIVE_LISTEN_VAD_DEFAULTS.idleRolloverMs
        ) {
          rotateRecorder({ discard: true });
        }
      }, 80);

      return true;
    } catch (error) {
      cleanupResources();
      setStatus("error");
      onErrorRef.current?.(
        error instanceof Error && error.message
          ? error.message
          : "Could not access the microphone.",
      );
      return false;
    }
  }, [cleanupResources, rotateRecorder, startFreshRecorder]);

  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, [cleanupResources]);

  return {
    status,
    elapsedSeconds,
    startListening,
    stopListening,
  };
}
