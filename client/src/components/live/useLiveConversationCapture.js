import { useEffect, useRef } from "react";
import { createLiveTranscriptionClientSecret } from "../../chatApi.js";

const OPENAI_REALTIME_TRANSCRIPTION_CALLS_URL =
  "https://api.openai.com/v1/realtime/calls";
const OPENAI_REALTIME_TRANSLATION_CALLS_URL =
  "https://api.openai.com/v1/realtime/translations/calls";
const CLOSE_TIMEOUT_MS = 5000;
const SILENCE_FINALIZE_MS = 1000;
const TRANSLATION_TURN_FINALIZE_MS = 1500;
const MIN_SPEECH_MS = 550;
const SPEECH_RMS_THRESHOLD = 0.018;

function createClientLiveTurnId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `live-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function calculateRms(samples) {
  let sum = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const normalized = (samples[index] - 128) / 128;
    sum += normalized * normalized;
  }

  return Math.sqrt(sum / samples.length);
}

function waitForIceGatheringComplete(peerConnection) {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      peerConnection.removeEventListener("icegatheringstatechange", onStateChange);
      reject(new Error("Timed out while preparing the live transcription connection."));
    }, 10000);

    function onStateChange() {
      if (peerConnection.iceGatheringState !== "complete") {
        return;
      }

      window.clearTimeout(timeoutId);
      peerConnection.removeEventListener("icegatheringstatechange", onStateChange);
      resolve();
    }

    peerConnection.addEventListener("icegatheringstatechange", onStateChange);
  });
}

export function useLiveConversationCapture({
  myLang,
  theirLang,
  setCaptureState,
  authFetch,
  onLiveTranscriptDelta,
  onLiveTranscript,
}) {
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const monitorFrameRef = useRef(0);
  const speechStartedAtRef = useRef(0);
  const lastSpeechAtRef = useRef(0);
  const peerConnectionRef = useRef(null);
  const eventsChannelRef = useRef(null);
  const closeTimeoutRef = useRef(0);
  const isListeningRef = useRef(false);
  const isClosingRef = useRef(false);
  const translationModeRef = useRef("fallback-transcription");
  const activeTranslationTurnRef = useRef(null);
  const isMountedRef = useRef(true);
  const latestValuesRef = useRef({
    myLang,
    theirLang,
    authFetch,
    onLiveTranscriptDelta,
    onLiveTranscript,
  });

  useEffect(() => {
    latestValuesRef.current = {
      myLang,
      theirLang,
      authFetch,
      onLiveTranscriptDelta,
      onLiveTranscript,
    };
  }, [myLang, theirLang, authFetch, onLiveTranscriptDelta, onLiveTranscript]);

  const patchCaptureState = (patch) => {
    if (!isMountedRef.current) {
      return;
    }

    setCaptureState((previousState) => ({
      ...previousState,
      ...(typeof patch === "function" ? patch(previousState) : patch),
    }));
  };

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = 0;
    }
  };

  const releaseConnection = ({ status = "idle", lastError = "" } = {}) => {
    clearCloseTimeout();
    const activeTranslationTurn = activeTranslationTurnRef.current;

    if (activeTranslationTurn?.finalizeTimeoutId) {
      window.clearTimeout(activeTranslationTurn.finalizeTimeoutId);
    }

    activeTranslationTurnRef.current = null;
    if (monitorFrameRef.current) {
      cancelAnimationFrame(monitorFrameRef.current);
      monitorFrameRef.current = 0;
    }
    const eventsChannel = eventsChannelRef.current;
    const peerConnection = peerConnectionRef.current;
    const stream = streamRef.current;
    const audioContext = audioContextRef.current;

    eventsChannelRef.current = null;
    peerConnectionRef.current = null;
    streamRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
    speechStartedAtRef.current = 0;
    lastSpeechAtRef.current = 0;
    isListeningRef.current = false;
    isClosingRef.current = false;

    if (eventsChannel && eventsChannel.readyState !== "closed") {
      eventsChannel.close();
    }

    if (peerConnection) {
      peerConnection.close();
    }

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    void audioContext?.close().catch(() => undefined);

    patchCaptureState({
      status,
      sessionStartedAt: null,
      activeSegmentId: null,
      lastError,
    });
  };

  const ensureActiveTranslationTurn = (itemId = "") => {
    const existingTurn = activeTranslationTurnRef.current;

    if (existingTurn) {
      if (existingTurn.finalizeTimeoutId) {
        window.clearTimeout(existingTurn.finalizeTimeoutId);
        existingTurn.finalizeTimeoutId = 0;
      }
      return existingTurn;
    }

    const turn = {
      itemId: itemId || createClientLiveTurnId(),
      transcript: "",
      translatedText: "",
      finalizeTimeoutId: 0,
    };
    activeTranslationTurnRef.current = turn;
    return turn;
  };

  const finalizeActiveTranslationTurn = () => {
    const turn = activeTranslationTurnRef.current;

    if (!turn || !turn.transcript.trim()) {
      return;
    }

    if (turn.finalizeTimeoutId) {
      window.clearTimeout(turn.finalizeTimeoutId);
    }

    activeTranslationTurnRef.current = null;
    const latest = latestValuesRef.current;
    latest.onLiveTranscript?.({
      itemId: turn.itemId,
      transcript: turn.transcript,
      translatedText: turn.translatedText,
      sourceLanguage: latest.myLang,
      targetLanguage: latest.theirLang,
      liveMode: "realtime-translation",
    });
  };

  const scheduleTranslationTurnFinalize = () => {
    const turn = activeTranslationTurnRef.current;

    if (!turn) {
      return;
    }

    if (turn.finalizeTimeoutId) {
      window.clearTimeout(turn.finalizeTimeoutId);
    }

    turn.finalizeTimeoutId = window.setTimeout(() => {
      turn.finalizeTimeoutId = 0;
      finalizeActiveTranslationTurn();
    }, TRANSLATION_TURN_FINALIZE_MS);
  };

  const retryWithFallback = (reason) => {
    if (
      translationModeRef.current !== "realtime-translation" ||
      isClosingRef.current
    ) {
      return false;
    }

    releaseConnection({ status: "starting", lastError: "" });
    void startListening({
      forceFallback: true,
      fallbackReason:
        reason || "Realtime translation failed; using fallback translation.",
    });
    return true;
  };

  const handleRealtimeEvent = (event) => {
    const latest = latestValuesRef.current;

    if (translationModeRef.current === "realtime-translation") {
      if (
        event?.type === "session.input_transcript.delta" &&
        typeof event.delta === "string" &&
        event.delta
      ) {
        const turn = ensureActiveTranslationTurn(event.item_id);
        turn.transcript = `${turn.transcript}${event.delta}`;
        latest.onLiveTranscriptDelta?.({
          itemId: turn.itemId,
          transcriptDelta: event.delta,
          translatedTextDelta: "",
          sourceLanguage: latest.myLang,
          targetLanguage: latest.theirLang,
          liveMode: "realtime-translation",
        });
        patchCaptureState({ activeSegmentId: turn.itemId });
        return;
      }

      if (
        event?.type === "session.output_transcript.delta" &&
        typeof event.delta === "string" &&
        event.delta
      ) {
        const turn = ensureActiveTranslationTurn(event.item_id);
        turn.translatedText = `${turn.translatedText}${event.delta}`;
        latest.onLiveTranscriptDelta?.({
          itemId: turn.itemId,
          transcriptDelta: "",
          translatedTextDelta: event.delta,
          sourceLanguage: latest.myLang,
          targetLanguage: latest.theirLang,
          liveMode: "realtime-translation",
        });
        return;
      }
    }

    if (
      event?.type === "conversation.item.input_audio_transcription.delta" &&
      typeof event.item_id === "string" &&
      typeof event.delta === "string" &&
      event.delta
    ) {
      latest.onLiveTranscriptDelta?.({
        itemId: event.item_id,
        transcriptDelta: event.delta,
        sourceLanguage: latest.myLang,
        targetLanguage: latest.theirLang,
        liveMode: "fallback-transcription",
      });
      patchCaptureState({ activeSegmentId: event.item_id });
      return;
    }

    if (
      event?.type === "conversation.item.input_audio_transcription.completed" &&
      typeof event.item_id === "string" &&
      typeof event.transcript === "string"
    ) {
      latest.onLiveTranscript?.({
        itemId: event.item_id,
        transcript: event.transcript,
        sourceLanguage: latest.myLang,
        targetLanguage: latest.theirLang,
        liveMode: "fallback-transcription",
      });
      return;
    }

    if (event?.type === "session.closed") {
      finalizeActiveTranslationTurn();
      releaseConnection();
      return;
    }

    if (event?.type === "error") {
      const message =
        typeof event.error?.message === "string"
          ? event.error.message
          : translationModeRef.current === "realtime-translation"
            ? "Live translation connection failed."
            : "Live transcription connection failed.";

      if (retryWithFallback(`${message} Switching to fallback translation.`)) {
        return;
      }

      patchCaptureState({ lastError: message });
    }
  };

  const commitCurrentTranscriptTurn = () => {
    const eventsChannel = eventsChannelRef.current;

    if (translationModeRef.current === "realtime-translation") {
      scheduleTranslationTurnFinalize();
    } else if (eventsChannel?.readyState === "open") {
      eventsChannel.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    }

    speechStartedAtRef.current = 0;
    lastSpeechAtRef.current = 0;
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

    if (rms >= SPEECH_RMS_THRESHOLD) {
      if (!speechStartedAtRef.current) {
        speechStartedAtRef.current = now;
      }
      lastSpeechAtRef.current = now;
    } else if (
      speechStartedAtRef.current &&
      now - speechStartedAtRef.current >= MIN_SPEECH_MS &&
      now - lastSpeechAtRef.current >= SILENCE_FINALIZE_MS
    ) {
      commitCurrentTranscriptTurn();
    }

    monitorFrameRef.current = requestAnimationFrame(monitorAudio);
  };

  const startListening = async ({
    forceFallback = false,
    fallbackReason = "",
  } = {}) => {
    if (isListeningRef.current || peerConnectionRef.current) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof RTCPeerConnection === "undefined"
    ) {
      patchCaptureState({
        status: "error",
        lastError: "This browser does not support live audio transcription.",
      });
      return;
    }

    try {
      translationModeRef.current = "fallback-transcription";
      patchCaptureState({
        status: "starting",
        lastError: "",
        liveMode: "",
        fallbackReason: forceFallback ? fallbackReason : "",
        sessionStartedAt: new Date().toISOString(),
      });

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const peerConnection = new RTCPeerConnection();
      const eventsChannel = peerConnection.createDataChannel("oai-events");
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass();
      const audioSource = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      const latest = latestValuesRef.current;

      analyser.fftSize = 1024;
      audioSource.connect(analyser);
      await audioContext.resume();

      stream.getAudioTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      peerConnectionRef.current = peerConnection;
      eventsChannelRef.current = eventsChannel;

      eventsChannel.addEventListener("message", ({ data }) => {
        try {
          handleRealtimeEvent(JSON.parse(data));
        } catch {
          // Ignore malformed non-protocol data without interrupting audio capture.
        }
      });

      eventsChannel.addEventListener("close", () => {
        if (!isClosingRef.current && peerConnectionRef.current === peerConnection) {
          if (
            retryWithFallback(
              "Realtime translation disconnected; using fallback translation.",
            )
          ) {
            return;
          }

          releaseConnection({
            status: "error",
            lastError: "Live transcription disconnected unexpectedly.",
          });
        }
      });

      peerConnection.addEventListener("connectionstatechange", () => {
        if (
          peerConnection.connectionState === "failed" &&
          peerConnectionRef.current === peerConnection
        ) {
          if (
            retryWithFallback(
              "Realtime translation connection failed; using fallback translation.",
            )
          ) {
            return;
          }

          releaseConnection({
            status: "error",
            lastError: "Live transcription connection failed.",
          });
        }
      });

      peerConnection.addEventListener("track", ({ track }) => {
        // StringPhone renders translated text here; do not play the model's
        // translated audio on top of the conversation audio.
        track.enabled = false;
      });

      const clientSecret = await createLiveTranscriptionClientSecret({
        sourceLanguage: latest.myLang,
        targetLanguage: latest.theirLang,
        forceFallback,
        fallbackReason,
        authFetch: latest.authFetch,
      });

      if (typeof clientSecret?.value !== "string" || !clientSecret.value) {
        throw new Error("Live transcription did not return a session credential.");
      }

      translationModeRef.current =
        clientSecret.liveMode === "realtime-translation"
          ? "realtime-translation"
          : "fallback-transcription";
      patchCaptureState({
        liveMode: translationModeRef.current,
        fallbackReason:
          translationModeRef.current === "fallback-transcription" &&
          typeof clientSecret.fallbackReason === "string"
            ? clientSecret.fallbackReason
            : forceFallback
              ? fallbackReason
              : "",
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await waitForIceGatheringComplete(peerConnection);
      const sdp = peerConnection.localDescription?.sdp;

      if (!sdp) {
        throw new Error("Unable to prepare the live transcription connection.");
      }

      const response = await fetch(
        translationModeRef.current === "realtime-translation"
          ? OPENAI_REALTIME_TRANSLATION_CALLS_URL
          : OPENAI_REALTIME_TRANSCRIPTION_CALLS_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clientSecret.value}`,
            "Content-Type": "application/sdp",
          },
          body: sdp,
        },
      );

      if (!response.ok) {
        throw new Error(
          translationModeRef.current === "realtime-translation"
            ? "OpenAI could not start live translation."
            : "OpenAI could not start live transcription.",
        );
      }

      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: await response.text(),
      });

      isListeningRef.current = true;
      patchCaptureState({ status: "listening", lastError: "" });
      monitorFrameRef.current = requestAnimationFrame(monitorAudio);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Unable to start live transcription.";

      if (
        !forceFallback &&
        !isClosingRef.current &&
        retryWithFallback(`${message} Switching to fallback translation.`)
      ) {
        return;
      }

      releaseConnection({
        status: "error",
        lastError: message,
      });
    }
  };

  const stopListening = () => {
    if (!isListeningRef.current && !peerConnectionRef.current) {
      return;
    }

    patchCaptureState({ status: "stopping" });
    isListeningRef.current = false;
    isClosingRef.current = true;

    const eventsChannel = eventsChannelRef.current;

    if (eventsChannel?.readyState === "open") {
      if (speechStartedAtRef.current) {
        commitCurrentTranscriptTurn();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      eventsChannel.send(JSON.stringify({ type: "session.close" }));
      closeTimeoutRef.current = window.setTimeout(() => {
        releaseConnection();
      }, CLOSE_TIMEOUT_MS);
      return;
    }

    releaseConnection();
  };

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      releaseConnection();
    };
  }, []);

  return { startListening, stopListening };
}
