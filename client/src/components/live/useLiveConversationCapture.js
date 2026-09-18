import { useEffect, useRef } from "react";
import { createLiveTranscriptionClientSecret } from "../../chatApi.js";

const OPENAI_REALTIME_TRANSCRIPTION_CALLS_URL =
  "https://api.openai.com/v1/realtime/calls";
const CLOSE_TIMEOUT_MS = 5000;
const SILENCE_FINALIZE_MS = 1000;
const MIN_SPEECH_MS = 550;
const SPEECH_RMS_THRESHOLD = 0.018;

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

    peerConnection?.close();
    stream?.getTracks().forEach((track) => track.stop());
    void audioContext?.close().catch(() => undefined);

    patchCaptureState({
      status,
      sessionStartedAt: null,
      activeSegmentId: null,
      lastError,
    });
  };

  const handleRealtimeEvent = (event) => {
    const latest = latestValuesRef.current;

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
        liveMode: "realtime-transcription",
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
        liveMode: "realtime-transcription",
      });
      return;
    }

    if (event?.type === "session.closed") {
      releaseConnection();
      return;
    }

    if (event?.type === "error") {
      const message =
        typeof event.error?.message === "string"
          ? event.error.message
          : "Live transcription connection failed.";
      patchCaptureState({ lastError: message });
    }
  };

  const commitCurrentTranscriptTurn = () => {
    const eventsChannel = eventsChannelRef.current;

    if (eventsChannel?.readyState === "open") {
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

  const startListening = async () => {
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
      patchCaptureState({
        status: "starting",
        lastError: "",
        liveMode: "",
        activeSpeaker: null,
        activeLanguageCode: "",
        sessionStartedAt: new Date().toISOString(),
      });

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;
      const eventsChannel = peerConnection.createDataChannel("oai-events");
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error("This browser does not support live audio analysis.");
      }

      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;
      const audioSource = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      const latest = latestValuesRef.current;

      analyser.fftSize = 1024;
      audioSource.connect(analyser);
      await audioContext.resume();

      stream.getAudioTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      analyserRef.current = analyser;
      eventsChannelRef.current = eventsChannel;

      eventsChannel.addEventListener("message", ({ data }) => {
        try {
          handleRealtimeEvent(JSON.parse(data));
        } catch {
          // Ignore malformed non-protocol data without interrupting capture.
        }
      });

      eventsChannel.addEventListener("close", () => {
        if (!isClosingRef.current && peerConnectionRef.current === peerConnection) {
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
          releaseConnection({
            status: "error",
            lastError: "Live transcription connection failed.",
          });
        }
      });

      peerConnection.addEventListener("track", ({ track }) => {
        // Do not play the provider's translated audio over the conversation.
        track.enabled = false;
      });

      const clientSecret = await createLiveTranscriptionClientSecret({
        sourceLanguage: latest.myLang,
        targetLanguage: latest.theirLang,
        authFetch: latest.authFetch,
        forceFallback: true,
      });

      if (typeof clientSecret?.value !== "string" || !clientSecret.value) {
        throw new Error("Live transcription did not return a session credential.");
      }

      patchCaptureState({
        liveMode: "realtime-transcription",
        fallbackReason: "",
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await waitForIceGatheringComplete(peerConnection);
      const sdp = peerConnection.localDescription?.sdp;

      if (!sdp) {
        throw new Error("Unable to prepare the live transcription connection.");
      }

      const response = await fetch(OPENAI_REALTIME_TRANSCRIPTION_CALLS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clientSecret.value}`,
          "Content-Type": "application/sdp",
        },
        body: sdp,
      });

      if (!response.ok) {
        throw new Error("OpenAI could not start live transcription.");
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

      releaseConnection({ status: "error", lastError: message });
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
