import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Ear,
  Globe,
  Loader2,
  Mic,
  Phone,
  User,
  Users,
  Volume2,
} from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "/api";

const LANGUAGES = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "pt", name: "Português", flag: "🇵🇹" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "nl", name: "Nederlands", flag: "🇳🇱" },
  { code: "hi", name: "हिन्दी", flag: "🇮🇳" },
  { code: "ar", name: "العربية", flag: "🇸🇦" },
  { code: "fa", name: "Farsi", flag: "FA" },
];

const MAX_RECORDING_TIME = 30;

function getSupportedMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function base64ToBlob(base64, mimeType) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType });
}

async function translateSpeech({ recording, targetLanguage }) {
  const formData = new FormData();
  const extension = recording.blob.type.includes("mp4") ? "m4a" : "webm";
  const fileName = `stringphone-turn.${extension}`;

  formData.append("targetLanguage", targetLanguage.code);
  formData.append("responseMode", "json");
  formData.append("sourceAudio", recording.blob, fileName);
  formData.append("voiceSample", recording.blob, fileName);

  const response = await fetch(`${API_BASE_URL}/speech/translate`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let message = "Speech translation failed.";
    try {
      const body = await response.json();
      message = body.error ?? message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  return response.json();
}

function useRecorder() {
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      throw new Error("This browser does not support audio recording.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getSupportedMimeType();
    const mediaRecorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );

    streamRef.current = stream;
    chunksRef.current = [];
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.start();
  };

  const stop = async () =>
    new Promise((resolve, reject) => {
      const recorder = mediaRecorderRef.current;

      if (!recorder || recorder.state === "inactive") {
        stopTracks();
        reject(new Error("No active recording to stop."));
        return;
      }

      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        mediaRecorderRef.current = null;
        stopTracks();
        resolve({ blob, mimeType: type });
      };

      recorder.stop();
    });

  const cancel = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    stopTracks();
  };

  useEffect(() => cancel, []);

  return { start, stop, cancel };
}

function useCountdown({ active, onExpire }) {
  const [recordingTimer, setRecordingTimer] = useState(MAX_RECORDING_TIME);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!active) {
      setRecordingTimer(MAX_RECORDING_TIME);
      return undefined;
    }

    const timer = setInterval(() => {
      setRecordingTimer((prev) => {
        if (prev <= 1) {
          onExpireRef.current();
          return MAX_RECORDING_TIME;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [active]);

  return recordingTimer;
}

function useTranslationFlow() {
  const recorder = useRecorder();
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const currentRunRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioSourceRef = useRef(null);
  const audioUrlRef = useRef(null);
  const playerRef = useRef(null);

  const ensureAudioContext = async () => {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  };

  const resetAudio = () => {
    if (audioSourceRef.current) {
      audioSourceRef.current.onended = null;
      try {
        audioSourceRef.current.stop();
      } catch {
        // Ignore stop errors when the source has already finished.
      }
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }

    if (playerRef.current) {
      playerRef.current.pause();
      playerRef.current = null;
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  };

  const playTranslatedAudio = async (audioBlob) => {
    const audioContext = audioContextRef.current;

    if (audioContext && audioContext.state !== "closed") {
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const source = audioContext.createBufferSource();

      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        if (audioSourceRef.current === source) {
          audioSourceRef.current = null;
        }
        reset();
      };

      audioSourceRef.current = source;
      source.start(0);
      return;
    }

    const audioUrl = URL.createObjectURL(audioBlob);
    const player = new Audio(audioUrl);

    audioUrlRef.current = audioUrl;
    playerRef.current = player;
    player.onended = reset;
    await player.play();
  };

  const reset = () => {
    resetAudio();
    setStatus("idle");
    setError("");
    currentRunRef.current = null;
  };

  const startRecording = async (run) => {
    if (status !== "idle") return;

    try {
      resetAudio();
      setError("");
      currentRunRef.current = run;
      await ensureAudioContext();
      await recorder.start();
      setStatus("recording");
    } catch (recordingError) {
      currentRunRef.current = null;
      setStatus("idle");
      setError(recordingError.message);
    }
  };

  const stopRecording = async () => {
    if (status !== "recording" || !currentRunRef.current) return;

    const run = currentRunRef.current;
    setStatus("processing");

    try {
      const recording = await recorder.stop();
      const data = await translateSpeech({
        recording,
        targetLanguage: run.targetLanguage,
      });
      const audioBlob = base64ToBlob(data.audio.base64, data.audio.mimeType);
      const historyEntry = {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        transcript: data.transcript,
        translation: data.translation,
        targetLanguage: data.targetLanguage,
        audioBlob,
        run,
      };

      resetAudio();

      setHistory((previous) => [...previous, historyEntry]);
      setResult(historyEntry);
      setStatus("playing");

      await playTranslatedAudio(audioBlob);
    } catch (translationError) {
      recorder.cancel();
      setError(translationError.message);
      currentRunRef.current = null;
      setStatus("idle");
    }
  };

  useEffect(
    () => () => {
      resetAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    },
    [],
  );

  return {
    status,
    result,
    history,
    error,
    currentRun: currentRunRef.current,
    startRecording,
    stopRecording,
    replayHistoryItem: async (item) => {
      if (
        !item?.audioBlob ||
        status === "recording" ||
        status === "processing"
      ) {
        return;
      }

      try {
        resetAudio();
        currentRunRef.current = item.run ?? null;
        setResult(item);
        setError("");
        await ensureAudioContext();
        setStatus("playing");
        await playTranslatedAudio(item.audioBlob);
      } catch (playbackError) {
        setError(playbackError.message);
        setStatus("idle");
        currentRunRef.current = null;
      }
    },
    clearError: () => setError(""),
  };
}

function LanguageSelector({ selected, onSelect, disabled, orientation }) {
  const [isOpen, setIsOpen] = useState(false);

  let positionClasses = "top-full mt-3";
  if (orientation === "up") {
    positionClasses = "bottom-full mb-3";
  } else if (orientation === "top") {
    positionClasses =
      "bottom-full mb-3 landscape:top-full landscape:bottom-auto landscape:mt-3 landscape:mb-0";
  }

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  return (
    <div
      className={`relative ${disabled ? "opacity-40 pointer-events-none" : ""}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full min-w-[100px] sm:min-w-[120px] items-center justify-center space-x-1.5 sm:space-x-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 sm:px-4 sm:py-2 text-white shadow-sm backdrop-blur-md transition-all duration-300 hover:bg-white/10"
      >
        <Globe size={14} className="text-zinc-400 sm:w-[14px] sm:h-[14px] w-3 h-3" strokeWidth={1.5} />
        <span className="text-[10px] sm:text-xs font-medium tracking-wide">
          {selected.flag} {selected.name}
        </span>
      </button>

      {isOpen && (
        <div
          className={`absolute left-1/2 z-50 w-44 -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/90 shadow-2xl backdrop-blur-xl transition-all duration-200 animate-zoom-in landscape:left-0 landscape:translate-x-0 ${positionClasses}`}
        >
          <div className="p-1.5">
            {LANGUAGES.map((lang) => (
              <button
                type="button"
                key={lang.code}
                onClick={() => {
                  onSelect(lang);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
                  selected.code === lang.code
                    ? "bg-white/10 font-medium text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                }`}
              >
                <span className="text-base">{lang.flag}</span>
                <span>{lang.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AudioWave({ active, colorClass = "bg-zinc-300" }) {
  const bars = useMemo(
    () => [
      { height: 36, duration: 0.45 },
      { height: 68, duration: 0.52 },
      { height: 44, duration: 0.38 },
      { height: 92, duration: 0.6 },
      { height: 58, duration: 0.48 },
      { height: 76, duration: 0.54 },
      { height: 40, duration: 0.42 },
    ],
    [],
  );

  return (
    <div
      className={`flex h-10 items-center justify-center space-x-1.5 transition-all duration-500 ${
        active ? "scale-100 opacity-100" : "scale-90 opacity-0"
      }`}
    >
      {bars.map((bar, i) => (
        <div
          key={bar.height}
          className={`w-1.5 animate-pulse rounded-full ${colorClass}`}
          style={{
            height: active ? `${bar.height}%` : "4px",
            animationDuration: `${bar.duration}s`,
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}

function ErrorNotice({ message, onDismiss }) {
  if (!message) return null;

  return (
    <button
      type="button"
      onClick={onDismiss}
      className="absolute bottom-5 left-1/2 z-[60] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full border border-rose-500/25 bg-rose-950/80 px-4 py-2 text-xs font-medium text-rose-100 shadow-2xl backdrop-blur-md"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)" }}
    >
      {message}
    </button>
  );
}

function TranscriptCard({ result, onClick, isActive = false }) {
  const Component = onClick ? "button" : "div";

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`w-full snap-center animate-slide-up rounded-2xl sm:rounded-[2rem] border px-4 py-3 sm:px-7 sm:py-5 text-center shadow-lg transition-all duration-300 ${
        isActive
          ? "scale-100 border-emerald-500/30 bg-zinc-800 opacity-100 shadow-[0_0_40px_rgba(16,185,129,0.15)]"
          : "scale-[0.97] border-white/5 bg-zinc-800/60 opacity-80"
      } ${onClick ? "cursor-pointer hover:border-white/10 hover:bg-zinc-700 hover:opacity-100" : ""}`}
    >
      <div className="mb-1 sm:mb-2 flex items-center justify-center gap-1.5 sm:gap-2 text-[8px] sm:text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
        <Phone
          size={10}
          className={`sm:w-3 sm:h-3 ${isActive ? "text-emerald-300" : "text-amber-500/50"}`}
        />
        <span>{result.targetLanguage}</span>
      </div>
      <p className="mb-1 sm:mb-2 text-base font-medium leading-snug tracking-tight text-white md:text-2xl">
        &ldquo;{result.translation}&rdquo;
      </p>
      <p className="text-xs text-zinc-400 md:text-base">
        &ldquo;{result.transcript}&rdquo;
      </p>
    </Component>
  );
}

function TranscriptCarousel({
  history,
  activeResultId,
  onReplay,
  className = "",
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    container.scrollTop = container.scrollHeight;
  }, [history.length]);

  return (
    <div className={`relative w-full overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)] ${className}`}>
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto px-2 py-4 sm:py-8 snap-y snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex min-h-full flex-col justify-end gap-3 sm:gap-4">
          {history.map((item) => (
            <TranscriptCard
              key={item.id}
              result={item}
              onClick={() => onReplay(item)}
              isActive={item.id === activeResultId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function UserSection({
  position,
  userState,
  isActiveSpeaker,
  isLocked,
  language,
  setLanguage,
  result,
  history,
  activeResultId,
  onReplay,
  onStartInteraction,
  onStopInteraction,
}) {
  const recordingTimer = useCountdown({
    active: userState === "recording" && isActiveSpeaker,
    onExpire: onStopInteraction,
  });
  const isTop = position === "top";
  const hasHistory = history.length > 0;

  return (
    <section
      className={`relative flex flex-1 flex-col items-center justify-between pt-6 pb-2 px-2 sm:p-8 sm:pt-12 transition-all duration-700 ease-in-out ${
        isTop ? "rotate-180 landscape:rotate-0" : ""
      } ${
        isLocked
          ? "pointer-events-none opacity-40 grayscale-[0.5]"
          : "opacity-100"
      } ${
        isActiveSpeaker && userState === "playing"
          ? "bg-zinc-900/50"
          : "bg-transparent"
      }`}
    >
      <div className="flex w-full items-start justify-between">
        <LanguageSelector
          selected={language}
          onSelect={setLanguage}
          disabled={isLocked || userState !== "idle"}
          orientation={position}
        />
        <div className="flex h-6 items-center">
          {userState === "recording" && isActiveSpeaker && (
            <div className="flex animate-fade-in items-center space-x-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1">
              <div className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
              <span className="font-mono text-xs font-medium text-rose-400">
                {recordingTimer}s
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="relative flex w-full flex-col items-center justify-center">
        <div className="mb-1 sm:mb-6 flex h-6 sm:h-10 items-center justify-center">
          {isActiveSpeaker && (
            <span
              className={`animate-pulse text-[10px] sm:text-xs font-medium uppercase tracking-[0.2em] ${
                userState === "recording"
                  ? "text-rose-400"
                  : userState === "processing"
                    ? "text-amber-400"
                    : "text-emerald-400"
              }`}
            >
              {userState === "recording"
                ? "Listening"
                : userState === "processing"
                  ? "Translating"
                  : "Speaking"}
            </span>
          )}
          {isLocked && !isActiveSpeaker && (
            <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              Partner&apos;s Turn
            </span>
          )}
        </div>

        <div className="group relative flex items-center justify-center">
          <button
            type="button"
            onClick={() => {
              if (userState === "idle") {
                onStartInteraction();
                return;
              }

              if (userState === "recording" && isActiveSpeaker) {
                onStopInteraction();
              }
            }}
            disabled={
              isLocked || userState === "processing" || userState === "playing"
            }
            className={`relative z-10 flex h-16 w-16 sm:h-32 sm:w-32 items-center justify-center rounded-full transition-all duration-300 ${
              userState === "recording" && isActiveSpeaker
                ? "scale-105 bg-gradient-to-tr from-rose-600 to-red-500 shadow-[0_0_50px_rgba(244,63,94,0.4)]"
                : "border border-white/5 bg-zinc-800 shadow-xl hover:scale-105 hover:bg-zinc-700 active:scale-95"
            } ${userState === "processing" ? "cursor-wait bg-zinc-800/80 backdrop-blur-md" : ""} ${
              userState === "playing"
                ? "border-emerald-500/30 bg-zinc-800 shadow-[0_0_40px_rgba(16,185,129,0.15)]"
                : ""
            }`}
          >
            {userState === "idle" && (
              <div className="flex transform flex-col items-center transition-transform group-hover:-translate-y-1">
                <Mic
                  size={20}
                  className="mb-0.5 text-zinc-200 sm:mb-2 sm:h-9 sm:w-9"
                  strokeWidth={1.5}
                />
                <span className="text-[8px] sm:text-[10px] font-semibold tracking-widest text-zinc-400">
                  TAP
                </span>
              </div>
            )}
            {userState === "recording" && isActiveSpeaker && (
              <div className="h-8 w-8 animate-pulse rounded-sm bg-white" />
            )}
            {userState === "processing" && isActiveSpeaker && (
              <Loader2
                size={20}
                className="animate-spin text-amber-400 sm:h-9 sm:w-9"
                strokeWidth={1.5}
              />
            )}
            {userState === "playing" && isActiveSpeaker && (
              <Volume2
                size={20}
                className="animate-pulse text-emerald-400 sm:h-9 sm:w-9"
                strokeWidth={1.5}
              />
            )}
          </button>
        </div>
      </div>

      <div className="flex min-h-[5rem] sm:min-h-[8rem] w-full flex-1 items-center justify-center">
        {userState === "recording" || userState === "processing" ? (
          <AudioWave
            active={userState === "recording" && isActiveSpeaker}
            colorClass="bg-rose-400"
          />
        ) : hasHistory ? (
          <div className="h-full max-h-[20rem] w-full max-w-sm">
            <TranscriptCarousel
              history={history}
              activeResultId={activeResultId}
              onReplay={onReplay}
              className="h-full"
            />
          </div>
        ) : (
          <div className="h-10" />
        )}
      </div>
    </section>
  );
}

function ConversationScreen({ myLang, setMyLang, theirLang, setTheirLang }) {
  const flow = useTranslationFlow();
  const activeSpeaker = flow.currentRun?.speaker ?? null;
  const topHistory = flow.history.filter((item) => item.run?.speaker === "top");
  const bottomHistory = flow.history.filter(
    (item) => item.run?.speaker === "bottom",
  );

  const startRecording = (speaker) => {
    flow.startRecording({
      speaker,
      targetLanguage: speaker === "top" ? myLang : theirLang,
    });
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden landscape:flex-row"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 16px) + 3.5rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 0.5rem)",
      }}
    >
      <UserSection
        position="top"
        userState={flow.status}
        isActiveSpeaker={activeSpeaker === "top"}
        isLocked={activeSpeaker === "bottom"}
        language={theirLang}
        setLanguage={setTheirLang}
        result={flow.result}
        history={topHistory}
        activeResultId={flow.result?.id ?? null}
        onReplay={flow.replayHistoryItem}
        onStartInteraction={() => startRecording("top")}
        onStopInteraction={flow.stopRecording}
      />

      <div className="group relative z-10 flex h-2 w-full shrink-0 items-center justify-center landscape:h-full landscape:w-2">
        <div className="absolute inset-0 bg-zinc-950" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent landscape:bg-gradient-to-b" />
        <div className="flex whitespace-nowrap rounded-full border border-white/10 bg-zinc-900 px-3 py-1 sm:px-5 sm:py-2 text-[10px] sm:text-xs uppercase tracking-[0.3em] text-zinc-400 shadow-xl backdrop-blur-md landscape:-rotate-90">
          <span className="flex items-center gap-1.5 sm:gap-2.5">
            <Phone size={12} className="text-amber-500/70 sm:w-[14px] sm:h-[14px]" />
            StringPhone
          </span>
        </div>
      </div>

      <UserSection
        position="bottom"
        userState={flow.status}
        isActiveSpeaker={activeSpeaker === "bottom"}
        isLocked={activeSpeaker === "top"}
        language={myLang}
        setLanguage={setMyLang}
        result={flow.result}
        history={bottomHistory}
        activeResultId={flow.result?.id ?? null}
        onReplay={flow.replayHistoryItem}
        onStartInteraction={() => startRecording("bottom")}
        onStopInteraction={flow.stopRecording}
      />

      <ErrorNotice message={flow.error} onDismiss={flow.clearError} />
    </div>
  );
}

function SingleModeScreen({ myLang, setMyLang, theirLang, setTheirLang }) {
  const flow = useTranslationFlow();
  const activeAction = flow.currentRun?.action ?? null;
  const hasHistory = flow.history.length > 0;
  const recordingTimer = useCountdown({
    active: flow.status === "recording",
    onExpire: flow.stopRecording,
  });

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-between overflow-y-auto px-4 py-4 sm:px-6 sm:py-6"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 16px) + 4.5rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 1.5rem)",
      }}
    >
      <div className="mt-8 flex w-full flex-1 flex-col items-center justify-center px-4">
        <div className="relative flex min-h-[160px] w-full max-w-lg flex-1 flex-col items-center justify-center">
          <div className="absolute top-0 flex h-8 w-full items-center justify-center text-center">
            {flow.status === "recording" && (
              <div className="flex items-center space-x-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 backdrop-blur-sm">
                <div
                  className={`h-2 w-2 animate-pulse rounded-full ${
                    activeAction === "speak" ? "bg-rose-500" : "bg-indigo-500"
                  }`}
                />
                <span className="font-mono text-xs font-medium text-zinc-300">
                  {recordingTimer}s
                </span>
              </div>
            )}
            {flow.status === "processing" && (
              <span className="animate-pulse text-xs font-medium uppercase tracking-[0.2em] text-amber-400">
                Translating
              </span>
            )}
          </div>

          <div className="mt-6 flex h-full w-full flex-col items-center justify-center">
            {flow.status === "recording" || flow.status === "processing" ? (
              <AudioWave
                active={flow.status === "recording"}
                colorClass={
                  activeAction === "speak" ? "bg-rose-400" : "bg-indigo-400"
                }
              />
            ) : !hasHistory ? (
              <div className="flex animate-fade-in items-center gap-2.5 rounded-full border border-white/5 bg-zinc-900/50 px-5 py-2 text-xs uppercase tracking-[0.3em] text-zinc-500 backdrop-blur-md">
                <Phone size={14} className="text-amber-500/50" />
                StringPhone
              </div>
            ) : (
              <TranscriptCarousel
                history={flow.history}
                activeResultId={flow.result?.id ?? null}
                onReplay={flow.replayHistoryItem}
                className="h-full min-h-[12rem] sm:min-h-[18rem] max-h-[28rem]"
              />
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 sm:mt-12 flex w-full max-w-md items-end justify-center space-x-6 md:space-x-12">
        <ActionColumn
          action="speak"
          label="SPEAK"
          Icon={Mic}
          language={myLang}
          setLanguage={setMyLang}
          status={flow.status}
          activeAction={activeAction}
          color="rose"
          onStart={() =>
            flow.startRecording({ action: "speak", targetLanguage: theirLang })
          }
          onStop={flow.stopRecording}
        />
        <ActionColumn
          action="listen"
          label="LISTEN"
          Icon={Ear}
          language={theirLang}
          setLanguage={setTheirLang}
          status={flow.status}
          activeAction={activeAction}
          color="indigo"
          onStart={() =>
            flow.startRecording({ action: "listen", targetLanguage: myLang })
          }
          onStop={flow.stopRecording}
        />
      </div>

      <ErrorNotice message={flow.error} onDismiss={flow.clearError} />
    </div>
  );
}

function ActionColumn({
  action,
  label,
  Icon,
  language,
  setLanguage,
  status,
  activeAction,
  color,
  onStart,
  onStop,
}) {
  const inactive = status !== "idle" && activeAction !== action;
  const isActive = activeAction === action;
  const activeGradient =
    color === "rose"
      ? "from-rose-600 to-red-500 shadow-[0_0_50px_rgba(244,63,94,0.4)]"
      : "from-indigo-600 to-blue-500 shadow-[0_0_50px_rgba(99,102,241,0.4)]";
  const ringColor = color === "rose" ? "#f43f5e" : "#6366f1";

  return (
    <div
      className={`flex flex-col items-center gap-4 transition-opacity duration-500 ${
        inactive
          ? "pointer-events-none opacity-30 grayscale-[0.5]"
          : "opacity-100"
      }`}
    >
      <div className="group relative">
        <button
          type="button"
          onClick={() => {
            if (status === "idle") {
              onStart();
              return;
            }

            if (status === "recording" && isActive) {
              onStop();
            }
          }}
          disabled={status !== "idle" && !(status === "recording" && isActive)}
          className={`relative z-10 flex h-20 w-20 sm:h-28 sm:w-28 items-center justify-center rounded-full transition-all duration-300 md:h-36 md:w-36 ${
            status === "recording" && isActive
              ? `scale-105 bg-gradient-to-tr ${activeGradient}`
              : "border border-white/5 bg-zinc-800 shadow-xl hover:scale-105 hover:bg-zinc-700 active:scale-95"
          }`}
        >
          {status === "idle" && (
            <div className="flex transform flex-col items-center transition-transform group-hover:-translate-y-1">
              <Icon
                size={28}
                className="mb-1 text-zinc-200 sm:mb-2 sm:h-8 sm:w-8 md:h-9 md:w-9"
                strokeWidth={1.5}
              />
              <span className="text-[10px] font-semibold tracking-widest text-zinc-400">
                {label}
              </span>
            </div>
          )}
          {status === "recording" && isActive && (
            <div className="h-8 w-8 animate-pulse rounded-sm bg-white" />
          )}
          {status === "processing" && isActive && (
            <Loader2
              size={36}
              className="animate-spin text-white"
              strokeWidth={1.5}
            />
          )}
          {status === "playing" && isActive && (
            <Volume2
              size={36}
              className="animate-pulse text-white"
              strokeWidth={1.5}
            />
          )}
        </button>
      </div>
      <LanguageSelector
        selected={language}
        onSelect={setLanguage}
        orientation="up"
        disabled={status !== "idle"}
      />
    </div>
  );
}

export default function StringPhoneApp() {
  const [appMode, setAppMode] = useState("single");
  const [myLang, setMyLang] = useState(LANGUAGES[0]);
  const [theirLang, setTheirLang] = useState(LANGUAGES[1]);

  return (
    <main
      className="relative flex min-h-screen w-full select-none flex-col overflow-hidden bg-zinc-950 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900 to-zinc-950 font-sans text-zinc-100"
      style={{ minHeight: "100svh", height: "100dvh" }}
    >
      <div
        className="absolute left-1/2 z-50 flex -translate-x-1/2 space-x-1 rounded-full border border-white/10 bg-white/5 p-1.5 shadow-2xl backdrop-blur-xl"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 1.5rem)" }}
      >
        <button
          type="button"
          onClick={() => setAppMode("single")}
          className={`relative z-10 flex items-center justify-center rounded-full px-8 py-2.5 transition-all duration-300 ${
            appMode === "single"
              ? "text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
          title="Single Mode"
        >
          <User size={18} strokeWidth={2.5} />
          {appMode === "single" && (
            <div className="absolute inset-0 -z-10 rounded-full border border-white/10 bg-white/10 shadow-sm" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setAppMode("conversation")}
          className={`relative z-10 flex items-center justify-center rounded-full px-8 py-2.5 transition-all duration-300 ${
            appMode === "conversation"
              ? "text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
          title="Split Mode"
        >
          <Users size={18} strokeWidth={2.5} />
          {appMode === "conversation" && (
            <div className="absolute inset-0 -z-10 rounded-full border border-white/10 bg-white/10 shadow-sm" />
          )}
        </button>
      </div>

      {appMode === "conversation" ? (
        <ConversationScreen
          myLang={myLang}
          setMyLang={setMyLang}
          theirLang={theirLang}
          setTheirLang={setTheirLang}
        />
      ) : (
        <SingleModeScreen
          myLang={myLang}
          setMyLang={setMyLang}
          theirLang={theirLang}
          setTheirLang={setTheirLang}
        />
      )}
    </main>
  );
}
