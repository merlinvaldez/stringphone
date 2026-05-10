import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Ear,
  Globe,
  Loader2,
  MessageSquare,
  Mic,
  Phone,
  Send,
  Square,
  User,
  Users,
  Volume2,
} from "lucide-react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "/api";

const LANGUAGES = [
  { code: "en", name: "English", flag: "\uD83C\uDDFA\uD83C\uDDF8" },
  { code: "es", name: "Espa\u00F1ol", flag: "\uD83C\uDDEA\uD83C\uDDF8" },
  { code: "fr", name: "Fran\u00E7ais", flag: "\uD83C\uDDEB\uD83C\uDDF7" },
  { code: "de", name: "Deutsch", flag: "\uD83C\uDDE9\uD83C\uDDEA" },
  { code: "pt", name: "Portugu\u00EAs", flag: "\uD83C\uDDF5\uD83C\uDDF9" },
  { code: "it", name: "Italiano", flag: "\uD83C\uDDEE\uD83C\uDDF9" },
  { code: "nl", name: "Nederlands", flag: "\uD83C\uDDF3\uD83C\uDDF1" },
  { code: "hi", name: "\u0939\u093F\u0928\u094D\u0926\u0940", flag: "\uD83C\uDDEE\uD83C\uDDF3" },
  { code: "ar", name: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629", flag: "\uD83C\uDDF8\uD83C\uDDE6" },
  { code: "fa", name: "\u0641\u0627\u0631\u0633\u06CC", flag: "\uD83C\uDDEE\uD83C\uDDF7" },
  { code: "zh", name: "Chinese", flag: "CN" },
  { code: "ja", name: "Japanese", flag: "JP" },
  { code: "ko", name: "Korean", flag: "KR" },
  { code: "pl", name: "Polish", flag: "PL" },
  { code: "ru", name: "Russian", flag: "RU" },
  { code: "sv", name: "Swedish", flag: "SE" },
  { code: "tr", name: "Turkish", flag: "TR" },
  { code: "tl", name: "Tagalog", flag: "PH" },
  { code: "bg", name: "Bulgarian", flag: "BG" },
  { code: "ro", name: "Romanian", flag: "RO" },
  { code: "cs", name: "Czech", flag: "CZ" },
  { code: "el", name: "Greek", flag: "GR" },
  { code: "fi", name: "Finnish", flag: "FI" },
  { code: "hr", name: "Croatian", flag: "HR" },
  { code: "ms", name: "Malay", flag: "MY" },
  { code: "sk", name: "Slovak", flag: "SK" },
  { code: "da", name: "Danish", flag: "DK" },
  { code: "ta", name: "Tamil", flag: "IN" },
  { code: "uk", name: "Ukrainian", flag: "UA" },
  { code: "hu", name: "Hungarian", flag: "HU" },
  { code: "no", name: "Norwegian", flag: "NO" },
  { code: "vi", name: "Vietnamese", flag: "VN" },
  { code: "bn", name: "Bengali", flag: "BD" },
  { code: "th", name: "Thai", flag: "TH" },
  { code: "he", name: "Hebrew", flag: "IL" },
  { code: "ka", name: "Georgian", flag: "GE" },
  { code: "id", name: "Indonesian", flag: "ID" },
  { code: "te", name: "Telugu", flag: "IN" },
  { code: "gu", name: "Gujarati", flag: "IN" },
  { code: "kn", name: "Kannada", flag: "IN" },
  { code: "ml", name: "Malayalam", flag: "IN" },
  { code: "mr", name: "Marathi", flag: "IN" },
  { code: "pa", name: "Punjabi", flag: "IN" },
];

const LANGUAGE_BY_CODE = Object.fromEntries(
  LANGUAGES.map((language) => [language.code, language]),
);

const MAX_RECORDING_TIME = 30;

const MODE_OPTIONS = [
  { id: "chat", label: "Chat", Icon: MessageSquare },
  { id: "single", label: "Single", Icon: User },
  { id: "conversation", label: "Conversation", Icon: Users },
];

const STATUS_LABELS = {
  pending: "Pending",
  transcribing: "Transcribing",
  translating: "Translating",
  generating_audio: "Generating audio",
  ready: "Ready",
  error: "Needs retry",
};

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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

function formatTimestamp(dateString) {
  return new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function getLanguageOption(code) {
  return LANGUAGE_BY_CODE[code] ?? LANGUAGES[0];
}

function buildLanguageSnapshot(language) {
  return {
    code: language.code,
    label: language.name,
    flag: language.flag,
  };
}

async function parseApiError(response, fallbackMessage) {
  try {
    const body = await response.json();
    return body.error ?? fallbackMessage;
  } catch {
    return response.statusText || fallbackMessage;
  }
}

async function translateTextMessage({ text, sourceLanguage, targetLanguage }) {
  const response = await fetch(`${API_BASE_URL}/chat/messages/text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      sourceLanguage: sourceLanguage.code,
      targetLanguage: targetLanguage.code,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Text translation failed."),
    );
  }

  return response.json();
}

async function translateVoiceMessage({
  recording,
  sourceLanguage,
  targetLanguage,
}) {
  const formData = new FormData();
  const extension = recording.blob.type.includes("mp4") ? "m4a" : "webm";
  const fileName = `stringphone-turn.${extension}`;

  formData.append("sourceLanguage", sourceLanguage.code);
  formData.append("targetLanguage", targetLanguage.code);
  formData.append("sourceAudio", recording.blob, fileName);
  formData.append("voiceSample", recording.blob, fileName);

  const response = await fetch(`${API_BASE_URL}/chat/messages/voice`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Voice translation failed."),
    );
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

function useVoiceModeFlow({ onSubmit, autoplayAudioUrl }) {
  const recorder = useRecorder();
  const mountedRef = useRef(true);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [currentRun, setCurrentRun] = useState(null);
  const [activeMessageId, setActiveMessageId] = useState(null);

  useEffect(
    () => {
      mountedRef.current = true;

      return () => {
        mountedRef.current = false;
        recorder.cancel();
      };
    },
    [],
  );

  const startRecording = async (run) => {
    if (status !== "idle") return;

    try {
      setError("");
      setCurrentRun(run);
      await recorder.start();

      if (mountedRef.current) {
        setStatus("recording");
      }
    } catch (recordingError) {
      if (!mountedRef.current) return;
      setCurrentRun(null);
      setStatus("idle");
      setError(recordingError.message);
    }
  };

  const stopRecording = async () => {
    if (status !== "recording" || !currentRun) return;

    const run = currentRun;

    if (mountedRef.current) {
      setStatus("processing");
    }

    try {
      const recording = await recorder.stop();
      const result = await onSubmit({ recording, run });

      if (!mountedRef.current) {
        return;
      }

      setActiveMessageId(result.messageId);

      if (result.audioUrl) {
        setStatus("playing");
        autoplayAudioUrl(result.audioUrl, () => {
          if (mountedRef.current) {
            setStatus("idle");
            setCurrentRun(null);
          }
        });
        return;
      }

      setStatus("idle");
      setCurrentRun(null);
    } catch (recordingError) {
      recorder.cancel();

      if (!mountedRef.current) {
        return;
      }

      setError(recordingError.message);
      setStatus("idle");
      setCurrentRun(null);
    }
  };

  return {
    status,
    error,
    currentRun,
    activeMessageId,
    startRecording,
    stopRecording,
    setActiveMessageId,
    clearError: () => setError(""),
  };
}

function LanguageSelector({ selected, onSelect, disabled, orientation = "down" }) {
  const [isOpen, setIsOpen] = useState(false);

  let positionClasses = "top-full mt-3 left-0";
  if (orientation === "up") {
    positionClasses =
      "bottom-full mb-3 left-1/2 -translate-x-1/2 origin-bottom";
  }

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
    }
  }, [disabled]);

  return (
    <div
      className={`relative ${disabled ? "pointer-events-none opacity-40" : ""}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full min-w-[112px] items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-white shadow-sm backdrop-blur-md transition-all duration-300 hover:bg-white/10"
      >
        <Globe size={14} className="text-zinc-400" strokeWidth={1.5} />
        <span className="text-xs font-medium tracking-wide">
          {selected.flag} {selected.name}
        </span>
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 max-h-[50vh] w-44 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900/90 shadow-2xl backdrop-blur-xl [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${positionClasses}`}
        >
          <div className="p-1.5">
            {LANGUAGES.map((language) => (
              <button
                type="button"
                key={language.code}
                onClick={() => {
                  onSelect(language);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
                  selected.code === language.code
                    ? "bg-white/10 font-medium text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                }`}
              >
                <span className="text-base">{language.flag}</span>
                <span>{language.name}</span>
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
      {bars.map((bar, index) => (
        <div
          key={bar.height}
          className={`w-1.5 animate-pulse rounded-full ${colorClass}`}
          style={{
            height: active ? `${bar.height}%` : "4px",
            animationDuration: `${bar.duration}s`,
            animationDelay: `${index * 0.1}s`,
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

function ModeSwitcher({ appMode, setAppMode }) {
  return (
    <div
      className="absolute left-1/2 z-50 flex -translate-x-1/2 gap-1 rounded-full border border-white/10 bg-white/5 p-1.5 shadow-2xl backdrop-blur-xl"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 1.5rem)" }}
    >
      {MODE_OPTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setAppMode(id)}
          className={`relative z-10 flex items-center justify-center gap-2 rounded-full px-3 py-2.5 text-xs font-medium uppercase tracking-[0.18em] transition-all duration-300 sm:px-4 ${
            appMode === id
              ? "text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
          title={label}
        >
          <Icon size={16} strokeWidth={2.1} />
          <span className="hidden sm:inline">{label}</span>
          {appMode === id && (
            <div className="absolute inset-0 -z-10 rounded-full border border-white/10 bg-white/10 shadow-sm" />
          )}
        </button>
      ))}
    </div>
  );
}

function MessageStatusPill({ status }) {
  const tintClasses =
    status === "error"
      ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
      : status === "ready"
        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
        : "border-amber-500/20 bg-amber-500/10 text-amber-200";

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${tintClasses}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function ChatEmptyState() {
  return (
    <div className="flex h-full min-h-[18rem] flex-col items-center justify-center rounded-[2rem] border border-white/5 bg-zinc-900/35 px-8 text-center shadow-xl backdrop-blur-md">
      <div className="mb-4 rounded-full border border-white/10 bg-white/5 p-4">
        <MessageSquare size={28} className="text-emerald-300" strokeWidth={1.6} />
      </div>
      <p className="mb-2 text-lg font-medium tracking-tight text-white">
        Every message lands in both languages.
      </p>
      <p className="max-w-md text-sm leading-6 text-zinc-400">
        Send text or record a voice note. Chat keeps the full bilingual thread,
        and turns from Single and Conversation appear here too.
      </p>
    </div>
  );
}

function MessageBubble({ message, onRetry, onAudioPlay }) {
  const isSelf = message.sender === "self";
  const isVoice = message.kind === "voice";
  const bubbleClasses = isSelf
    ? "ml-auto border-emerald-500/20 bg-emerald-500/10"
    : "mr-auto border-white/10 bg-zinc-900/90";
  const senderLabel = isSelf ? "You" : "Partner";
  const metadataAccent = isSelf ? "text-emerald-200" : "text-indigo-200";

  return (
    <article className={`flex w-full ${isSelf ? "justify-end" : "justify-start"}`}>
      <div className="w-full max-w-[88%] sm:max-w-[78%]">
        <div
          className={`mb-1.5 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500`}
        >
          <div className={`flex items-center gap-2 ${metadataAccent}`}>
            <span>{senderLabel}</span>
            <span>
              {message.sourceLanguageFlag} {message.sourceLanguageLabel}
            </span>
          </div>
          <span>{formatTimestamp(message.createdAt)}</span>
        </div>

        <div
          className={`rounded-[1.75rem] border px-4 py-3 shadow-xl backdrop-blur-md ${bubbleClasses}`}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              <span>{message.targetLanguageFlag}</span>
              <span>{message.targetLanguageLabel}</span>
            </div>
            <MessageStatusPill status={message.status} />
          </div>

          {isVoice ? (
            <div className="space-y-3">
              {message.audioUrl ? (
                <audio
                  controls
                  preload="metadata"
                  src={message.audioUrl}
                  onPlay={(event) => onAudioPlay(event.currentTarget)}
                  className="w-full accent-emerald-400"
                />
              ) : (
                <div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-400">
                  {message.status === "error" ? (
                    <span>Voice note failed before audio was ready.</span>
                  ) : (
                    <>
                      <Loader2 size={16} className="animate-spin text-amber-300" />
                      <span>Preparing translated voice note...</span>
                    </>
                  )}
                </div>
              )}

              {message.transcript ? (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Transcript
                  </p>
                  <p className="text-sm leading-6 text-white">
                    {message.transcript}
                  </p>
                </div>
              ) : null}

              {message.translatedText ? (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Translation
                  </p>
                  <p className="text-sm leading-6 text-zinc-200">
                    {message.translatedText}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Original
                </p>
                <p className="text-sm leading-6 text-white">
                  {message.originalText}
                </p>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Translation
                </p>
                <p className="text-sm leading-6 text-zinc-200">
                  {message.translatedText ||
                    (message.status === "error"
                      ? "Translation failed."
                      : "Working on the bilingual version...")}
                </p>
              </div>
            </div>
          )}

          {message.errorMessage ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
              <span className="text-xs text-rose-200">{message.errorMessage}</span>
              <button
                type="button"
                onClick={() => onRetry(message)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/10"
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ChatThread({ messages, onRetry, onAudioPlay }) {
  const threadRef = useRef(null);

  useEffect(() => {
    const container = threadRef.current;

    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  if (messages.length === 0) {
    return <ChatEmptyState />;
  }

  return (
    <div
      ref={threadRef}
      className="h-full overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex flex-col gap-4 pb-2">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onRetry={onRetry}
            onAudioPlay={onAudioPlay}
          />
        ))}
      </div>
    </div>
  );
}

const TranscriptCard = React.forwardRef(
  ({ message, onClick, isActive = false }, ref) => {
    const Component = onClick ? "button" : "div";

    return (
      <Component
        ref={ref}
        type={onClick ? "button" : undefined}
        onClick={onClick}
        className={`w-full snap-center rounded-2xl border px-4 py-3 text-center shadow-lg transition-all duration-300 sm:rounded-[2rem] sm:px-7 sm:py-5 ${
          isActive
            ? "scale-100 border-emerald-500/30 bg-zinc-800 opacity-100 shadow-[0_0_40px_rgba(16,185,129,0.15)]"
            : "scale-[0.97] border-white/5 bg-zinc-800/60 opacity-80"
        } ${onClick ? "cursor-pointer hover:border-white/10 hover:bg-zinc-700 hover:opacity-100" : ""}`}
      >
        <div className="mb-1 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500 sm:mb-2">
          <Phone
            size={12}
            className={isActive ? "text-emerald-300" : "text-amber-500/50"}
          />
          <span>{message.targetLanguageLabel}</span>
        </div>
        <p className="mb-1 text-base font-medium leading-snug tracking-tight text-white md:text-2xl sm:mb-2">
          &ldquo;{message.translatedText}&rdquo;
        </p>
        <p className="text-xs text-zinc-400 md:text-base">
          &ldquo;{message.transcript || message.originalText}&rdquo;
        </p>
      </Component>
    );
  },
);

function TranscriptCarousel({
  history,
  activeMessageId,
  onReplay,
  className = "",
}) {
  const lastCardRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const container = scrollRef.current;
    const card = lastCardRef.current;

    if (!container || !card) return;

    setTimeout(() => {
      const containerHeight = container.clientHeight;
      const cardHeight = card.offsetHeight;
      const cardTop = card.offsetTop;
      const targetScroll = cardTop - containerHeight / 2 + cardHeight / 2;

      container.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: "smooth",
      });
    }, 50);
  }, [history.length]);

  return (
    <div
      className={`relative w-full overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)] ${className}`}
    >
      <div
        ref={scrollRef}
        className="relative h-full overflow-y-auto px-2 snap-y snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="h-[40vh] shrink-0" />
          {history.map((message, index) => {
            const isLast = index === history.length - 1;

            return (
              <TranscriptCard
                key={message.id}
                ref={isLast ? lastCardRef : null}
                message={message}
                onClick={() => onReplay(message)}
                isActive={message.id === activeMessageId}
              />
            );
          })}
          <div className="h-[40vh] shrink-0" />
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
  history,
  activeMessageId,
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
      className={`relative flex min-h-0 flex-1 flex-col items-center justify-between px-2 pb-2 pt-6 transition-all duration-700 ease-in-out sm:p-8 sm:pt-12 ${
        isTop ? "rotate-180 landscape:rotate-0" : ""
      } ${
        isLocked
          ? "pointer-events-none opacity-40 grayscale-[0.5]"
          : "opacity-100"
      } ${isActiveSpeaker && userState === "playing" ? "bg-zinc-900/50" : "bg-transparent"}`}
    >
      <div className="flex w-full items-start justify-between">
        <LanguageSelector
          selected={language}
          onSelect={setLanguage}
          disabled={isLocked || userState !== "idle"}
          orientation={position}
        />
        <div className="flex h-6 items-center">
          {userState === "recording" && isActiveSpeaker ? (
            <div className="flex animate-fade-in items-center space-x-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1">
              <div className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
              <span className="font-mono text-xs font-medium text-rose-400">
                {recordingTimer}s
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative flex w-full flex-col items-center justify-center">
        <div className="mb-1 flex h-6 items-center justify-center sm:mb-6 sm:h-10">
          {isActiveSpeaker ? (
            <span
              className={`animate-pulse text-[10px] font-medium uppercase tracking-[0.2em] sm:text-xs ${
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
          ) : null}

          {isLocked && !isActiveSpeaker ? (
            <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              Partner&apos;s Turn
            </span>
          ) : null}
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
            className={`relative z-10 flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300 sm:h-32 sm:w-32 ${
              userState === "recording" && isActiveSpeaker
                ? "scale-105 bg-gradient-to-tr from-rose-600 to-red-500 shadow-[0_0_50px_rgba(244,63,94,0.4)]"
                : "border border-white/5 bg-zinc-800 shadow-xl hover:scale-105 hover:bg-zinc-700 active:scale-95"
            } ${userState === "processing" ? "cursor-wait bg-zinc-800/80 backdrop-blur-md" : ""} ${
              userState === "playing"
                ? "border-emerald-500/30 bg-zinc-800 shadow-[0_0_40px_rgba(16,185,129,0.15)]"
                : ""
            }`}
          >
            {userState === "idle" ? (
              <div className="flex transform flex-col items-center transition-transform group-hover:-translate-y-1">
                <Mic
                  size={20}
                  className="mb-0.5 text-zinc-200 sm:mb-2 sm:h-9 sm:w-9"
                  strokeWidth={1.5}
                />
                <span className="text-[8px] font-semibold tracking-widest text-zinc-400 sm:text-[10px]">
                  TAP
                </span>
              </div>
            ) : null}

            {userState === "recording" && isActiveSpeaker ? (
              <div className="h-8 w-8 animate-pulse rounded-sm bg-white" />
            ) : null}

            {userState === "processing" && isActiveSpeaker ? (
              <Loader2
                size={20}
                className="animate-spin text-amber-400 sm:h-9 sm:w-9"
                strokeWidth={1.5}
              />
            ) : null}

            {userState === "playing" && isActiveSpeaker ? (
              <Volume2
                size={20}
                className="animate-pulse text-emerald-400 sm:h-9 sm:w-9"
                strokeWidth={1.5}
              />
            ) : null}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
        {userState === "recording" || userState === "processing" ? (
          <AudioWave
            active={userState === "recording" && isActiveSpeaker}
            colorClass="bg-rose-400"
          />
        ) : hasHistory ? (
          <div className="h-full max-h-[20rem] w-full max-w-sm">
            <TranscriptCarousel
              history={history}
              activeMessageId={activeMessageId}
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

function ConversationScreen({
  myLang,
  setMyLang,
  theirLang,
  setTheirLang,
  voiceHistory,
  autoplayAudioUrl,
  submitVoiceMessage,
  replayVoiceMessage,
}) {
  const flow = useVoiceModeFlow({
    autoplayAudioUrl,
    onSubmit: async ({ recording, run }) =>
      submitVoiceMessage({
        originMode: "conversation",
        sender: run.speaker === "bottom" ? "self" : "partner",
        sourceLanguage: run.speaker === "bottom" ? myLang : theirLang,
        targetLanguage: run.speaker === "bottom" ? theirLang : myLang,
        recording,
      }),
  });
  const activeSpeaker = flow.currentRun?.speaker ?? null;

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
        history={voiceHistory}
        activeMessageId={flow.activeMessageId}
        onReplay={(message) => {
          flow.setActiveMessageId(message.id);
          replayVoiceMessage(message);
        }}
        onStartInteraction={() => flow.startRecording({ speaker: "top" })}
        onStopInteraction={flow.stopRecording}
      />

      <div className="group relative z-10 flex h-2 w-full shrink-0 items-center justify-center landscape:h-full landscape:w-2">
        <div className="absolute inset-0 bg-zinc-950" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent landscape:bg-gradient-to-b" />
        <div className="flex whitespace-nowrap rounded-full border border-white/10 bg-zinc-900 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-zinc-400 shadow-xl backdrop-blur-md sm:px-5 sm:py-2 sm:text-xs landscape:-rotate-90">
          <span className="flex items-center gap-1.5 sm:gap-2.5">
            <Phone
              size={12}
              className="text-amber-500/70 sm:h-[14px] sm:w-[14px]"
            />
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
        history={voiceHistory}
        activeMessageId={flow.activeMessageId}
        onReplay={(message) => {
          flow.setActiveMessageId(message.id);
          replayVoiceMessage(message);
        }}
        onStartInteraction={() => flow.startRecording({ speaker: "bottom" })}
        onStopInteraction={flow.stopRecording}
      />

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
          className={`relative z-10 flex h-20 w-20 items-center justify-center rounded-full transition-all duration-300 sm:h-28 sm:w-28 md:h-36 md:w-36 ${
            status === "recording" && isActive
              ? `scale-105 bg-gradient-to-tr ${activeGradient}`
              : "border border-white/5 bg-zinc-800 shadow-xl hover:scale-105 hover:bg-zinc-700 active:scale-95"
          }`}
        >
          {status === "idle" ? (
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
          ) : null}

          {status === "recording" && isActive ? (
            <div className="h-8 w-8 animate-pulse rounded-sm bg-white" />
          ) : null}

          {status === "processing" && isActive ? (
            <Loader2
              size={36}
              className="animate-spin text-white"
              strokeWidth={1.5}
            />
          ) : null}

          {status === "playing" && isActive ? (
            <Volume2
              size={36}
              className="animate-pulse text-white"
              strokeWidth={1.5}
            />
          ) : null}
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

function SingleModeScreen({
  myLang,
  setMyLang,
  theirLang,
  setTheirLang,
  voiceHistory,
  autoplayAudioUrl,
  submitVoiceMessage,
  replayVoiceMessage,
}) {
  const flow = useVoiceModeFlow({
    autoplayAudioUrl,
    onSubmit: async ({ recording, run }) =>
      submitVoiceMessage({
        originMode: "single",
        sender: run.action === "speak" ? "self" : "partner",
        sourceLanguage: run.action === "speak" ? myLang : theirLang,
        targetLanguage: run.action === "speak" ? theirLang : myLang,
        recording,
      }),
  });
  const activeAction = flow.currentRun?.action ?? null;
  const hasHistory = voiceHistory.length > 0;
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
            {flow.status === "recording" ? (
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
            ) : null}

            {flow.status === "processing" ? (
              <span className="animate-pulse text-xs font-medium uppercase tracking-[0.2em] text-amber-400">
                Translating
              </span>
            ) : null}
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
                history={voiceHistory}
                activeMessageId={flow.activeMessageId}
                onReplay={(message) => {
                  flow.setActiveMessageId(message.id);
                  replayVoiceMessage(message);
                }}
                className="h-full min-h-[12rem] max-h-[28rem] sm:min-h-[18rem]"
              />
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex w-full max-w-md items-end justify-center space-x-6 sm:mt-12 md:space-x-12">
        <ActionColumn
          action="speak"
          label="SPEAK"
          Icon={Mic}
          language={myLang}
          setLanguage={setMyLang}
          status={flow.status}
          activeAction={activeAction}
          color="rose"
          onStart={() => flow.startRecording({ action: "speak" })}
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
          onStart={() => flow.startRecording({ action: "listen" })}
          onStop={flow.stopRecording}
        />
      </div>

      <ErrorNotice message={flow.error} onDismiss={flow.clearError} />
    </div>
  );
}

function ChatHeader({
  myLang,
  setMyLang,
  theirLang,
  setTheirLang,
  disabled,
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-[1.75rem] border border-white/5 bg-zinc-900/45 px-4 py-4 shadow-xl backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Chat Thread
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          Every sent turn appears in both languages.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <LanguageSelector
          selected={myLang}
          onSelect={setMyLang}
          disabled={disabled}
        />
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          to
        </div>
        <LanguageSelector
          selected={theirLang}
          onSelect={setTheirLang}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function ChatComposer({
  sender,
  setSender,
  text,
  setText,
  recordingStatus,
  recordingTimer,
  sourceLanguage,
  targetLanguage,
  onSendText,
  onStartRecording,
  onStopRecording,
}) {
  const canSendText = text.trim().length > 0 && recordingStatus === "idle";

  return (
    <div className="mt-4 rounded-[2rem] border border-white/10 bg-zinc-900/80 p-3 shadow-2xl backdrop-blur-xl sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-full border border-white/10 bg-white/5 p-1">
          {[
            { id: "self", label: "You" },
            { id: "partner", label: "Partner" },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSender(option.id)}
              disabled={recordingStatus !== "idle"}
              className={`relative rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                sender === option.id
                  ? "text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {option.label}
              {sender === option.id ? (
                <span className="absolute inset-0 -z-10 rounded-full border border-white/10 bg-white/10" />
              ) : null}
            </button>
          ))}
        </div>

        <div className="text-right text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          <p>
            {sourceLanguage.flag} {sourceLanguage.name}
          </p>
          <p className="text-zinc-400">
            into {targetLanguage.flag} {targetLanguage.name}
          </p>
        </div>
      </div>

      {recordingStatus !== "idle" ? (
        <div className="mb-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {recordingStatus === "recording"
                ? "Recording voice note"
                : "Preparing bilingual voice note"}
            </p>
            <p className="mt-1 text-sm text-zinc-200">
              {recordingStatus === "recording"
                ? `Tap stop when the note is ready. ${recordingTimer}s left.`
                : "Transcribing, translating, and building the translated playback."}
            </p>
          </div>
          {recordingStatus === "recording" ? (
            <AudioWave active colorClass="bg-rose-400" />
          ) : (
            <Loader2 size={18} className="animate-spin text-amber-300" />
          )}
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSendText) {
                onSendText();
              }
            }
          }}
          disabled={recordingStatus !== "idle"}
          placeholder={`Write in ${sourceLanguage.name}. The thread will show both languages.`}
          className="h-14 flex-1 rounded-[1.5rem] border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
        />

        <button
          type="button"
          onClick={
            recordingStatus === "recording" ? onStopRecording : onStartRecording
          }
          disabled={recordingStatus === "processing"}
          className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
            recordingStatus === "recording"
              ? "bg-rose-600 text-white shadow-[0_0_30px_rgba(244,63,94,0.35)]"
              : "border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
          } disabled:cursor-not-allowed disabled:opacity-50`}
          title={recordingStatus === "recording" ? "Stop voice note" : "Record voice note"}
        >
          {recordingStatus === "recording" ? (
            <Square size={18} fill="currentColor" />
          ) : (
            <Mic size={18} />
          )}
        </button>

        <button
          type="button"
          onClick={onSendText}
          disabled={!canSendText}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 shadow-[0_0_30px_rgba(16,185,129,0.35)] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none"
          title="Send text message"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

function ChatScreen({
  myLang,
  setMyLang,
  theirLang,
  setTheirLang,
  messages,
  sendTextMessage,
  sendVoiceMessage,
  retryMessage,
  onAudioPlay,
}) {
  const recorder = useRecorder();
  const mountedRef = useRef(true);
  const [chatSender, setChatSender] = useState("self");
  const [composerText, setComposerText] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const recordingTimer = useCountdown({
    active: status === "recording",
    onExpire: () => {
      if (status === "recording") {
        void handleStopRecording();
      }
    },
  });

  const sourceLanguage = chatSender === "self" ? myLang : theirLang;
  const targetLanguage = chatSender === "self" ? theirLang : myLang;

  useEffect(
    () => {
      mountedRef.current = true;

      return () => {
        mountedRef.current = false;
        recorder.cancel();
      };
    },
    [],
  );

  const handleSendText = async () => {
    const text = composerText.trim();

    if (!text || status !== "idle") {
      return;
    }

    setComposerText("");
    setError("");

    await sendTextMessage({
      originMode: "chat",
      sender: chatSender,
      sourceLanguage,
      targetLanguage,
      text,
    });
  };

  const handleStartRecording = async () => {
    if (status !== "idle") return;

    try {
      setError("");
      await recorder.start();

      if (mountedRef.current) {
        setStatus("recording");
      }
    } catch (recordingError) {
      if (!mountedRef.current) return;
      setStatus("idle");
      setError(recordingError.message);
    }
  };

  async function handleStopRecording() {
    if (status !== "recording") return;

    if (mountedRef.current) {
      setStatus("processing");
    }

    try {
      const recording = await recorder.stop();

      await sendVoiceMessage({
        originMode: "chat",
        sender: chatSender,
        sourceLanguage,
        targetLanguage,
        recording,
      });

      if (mountedRef.current) {
        setStatus("idle");
      }
    } catch (recordingError) {
      recorder.cancel();

      if (!mountedRef.current) {
        return;
      }

      setStatus("idle");
      setError(recordingError.message);
    }
  }

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden px-4"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 16px) + 5.5rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 0.85rem)",
      }}
    >
      <ChatHeader
        myLang={myLang}
        setMyLang={setMyLang}
        theirLang={theirLang}
        setTheirLang={setTheirLang}
        disabled={status !== "idle"}
      />

      <div className="min-h-0 flex-1">
        <ChatThread
          messages={messages}
          onRetry={retryMessage}
          onAudioPlay={onAudioPlay}
        />
      </div>

      <ChatComposer
        sender={chatSender}
        setSender={setChatSender}
        text={composerText}
        setText={setComposerText}
        recordingStatus={status}
        recordingTimer={recordingTimer}
        sourceLanguage={sourceLanguage}
        targetLanguage={targetLanguage}
        onSendText={handleSendText}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
      />

      <ErrorNotice message={error} onDismiss={() => setError("")} />
    </div>
  );
}

export default function StringPhoneApp() {
  const [appMode, setAppMode] = useState("chat");
  const [myLang, setMyLang] = useState(LANGUAGES[0]);
  const [theirLang, setTheirLang] = useState(LANGUAGES[1]);
  const [messages, setMessages] = useState([]);
  const messagesRef = useRef(messages);
  const domAudioRef = useRef(null);
  const autoplayAudioRef = useRef(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(
    () => () => {
      messagesRef.current.forEach((message) => {
        if (message.audioUrl) {
          URL.revokeObjectURL(message.audioUrl);
        }
      });

      autoplayAudioRef.current?.pause();
      domAudioRef.current?.pause();
    },
    [],
  );

  const voiceHistory = useMemo(
    () =>
      messages.filter(
        (message) => message.kind === "voice" && message.status === "ready",
      ),
    [messages],
  );

  const pauseActiveAudio = (exclude = null) => {
    if (domAudioRef.current && domAudioRef.current !== exclude) {
      domAudioRef.current.pause();
    }

    if (autoplayAudioRef.current && autoplayAudioRef.current !== exclude) {
      autoplayAudioRef.current.pause();
    }
  };

  const handleThreadAudioPlay = (audioElement) => {
    pauseActiveAudio(audioElement);
    domAudioRef.current = audioElement;
  };

  const autoplayAudioUrl = (audioUrl, onEnded) => {
    pauseActiveAudio();
    const player = new Audio(audioUrl);

    autoplayAudioRef.current = player;
    player.onended = () => {
      if (autoplayAudioRef.current === player) {
        autoplayAudioRef.current = null;
      }

      onEnded?.();
    };
    player.onpause = () => {
      if (autoplayAudioRef.current === player && player.currentTime === 0) {
        autoplayAudioRef.current = null;
      }
    };
    player.play().catch(() => {
      if (autoplayAudioRef.current === player) {
        autoplayAudioRef.current = null;
      }

      onEnded?.();
    });
  };

  const replayVoiceMessage = (message) => {
    if (!message.audioUrl) return;
    autoplayAudioUrl(message.audioUrl);
  };

  const appendMessage = (message) => {
    const nextMessage = {
      ...message,
      id: createId(),
      createdAt: new Date().toISOString(),
    };

    setMessages((previous) => [...previous, nextMessage]);
    return nextMessage.id;
  };

  const updateMessage = (messageId, updater) => {
    setMessages((previous) =>
      previous.map((message) => {
        if (message.id !== messageId) {
          return message;
        }

        const patch = typeof updater === "function" ? updater(message) : updater;
        return { ...message, ...patch };
      }),
    );
  };

  const sendTextMessage = async ({
    originMode,
    sender,
    sourceLanguage,
    targetLanguage,
    text,
    existingMessageId,
  }) => {
    const trimmedText = text.trim();
    const sourceSnapshot = buildLanguageSnapshot(sourceLanguage);
    const targetSnapshot = buildLanguageSnapshot(targetLanguage);
    const retryPayload = {
      kind: "text",
      originMode,
      sender,
      sourceLanguageCode: sourceLanguage.code,
      targetLanguageCode: targetLanguage.code,
      text: trimmedText,
    };

    const messageId =
      existingMessageId ??
      appendMessage({
        kind: "text",
        originMode,
        sender,
        status: "translating",
        originalText: trimmedText,
        translatedText: "",
        transcript: "",
        audioUrl: "",
        errorMessage: "",
        sourceLanguageCode: sourceSnapshot.code,
        sourceLanguageLabel: sourceSnapshot.label,
        sourceLanguageFlag: sourceSnapshot.flag,
        targetLanguageCode: targetSnapshot.code,
        targetLanguageLabel: targetSnapshot.label,
        targetLanguageFlag: targetSnapshot.flag,
        retryPayload,
      });

    if (existingMessageId) {
      updateMessage(existingMessageId, {
        sender,
        originMode,
        status: "translating",
        originalText: trimmedText,
        translatedText: "",
        transcript: "",
        errorMessage: "",
        sourceLanguageCode: sourceSnapshot.code,
        sourceLanguageLabel: sourceSnapshot.label,
        sourceLanguageFlag: sourceSnapshot.flag,
        targetLanguageCode: targetSnapshot.code,
        targetLanguageLabel: targetSnapshot.label,
        targetLanguageFlag: targetSnapshot.flag,
        retryPayload,
      });
    }

    try {
      const data = await translateTextMessage({
        text: trimmedText,
        sourceLanguage,
        targetLanguage,
      });

      updateMessage(messageId, {
        status: "ready",
        originalText: data.originalText,
        translatedText: data.translatedText,
        errorMessage: "",
      });
    } catch (translationError) {
      updateMessage(messageId, {
        status: "error",
        errorMessage: translationError.message,
      });
    }

    return { messageId };
  };

  const sendVoiceMessage = async ({
    originMode,
    sender,
    sourceLanguage,
    targetLanguage,
    recording,
    existingMessageId,
  }) => {
    const sourceSnapshot = buildLanguageSnapshot(sourceLanguage);
    const targetSnapshot = buildLanguageSnapshot(targetLanguage);
    const retryPayload = {
      kind: "voice",
      originMode,
      sender,
      sourceLanguageCode: sourceLanguage.code,
      targetLanguageCode: targetLanguage.code,
      recordingBlob: recording.blob,
    };

    const messageId =
      existingMessageId ??
      appendMessage({
        kind: "voice",
        originMode,
        sender,
        status: "transcribing",
        originalText: "",
        translatedText: "",
        transcript: "",
        audioUrl: "",
        errorMessage: "",
        sourceLanguageCode: sourceSnapshot.code,
        sourceLanguageLabel: sourceSnapshot.label,
        sourceLanguageFlag: sourceSnapshot.flag,
        targetLanguageCode: targetSnapshot.code,
        targetLanguageLabel: targetSnapshot.label,
        targetLanguageFlag: targetSnapshot.flag,
        retryPayload,
      });

    if (existingMessageId) {
      updateMessage(existingMessageId, {
        sender,
        originMode,
        status: "transcribing",
        originalText: "",
        translatedText: "",
        transcript: "",
        audioUrl: "",
        errorMessage: "",
        sourceLanguageCode: sourceSnapshot.code,
        sourceLanguageLabel: sourceSnapshot.label,
        sourceLanguageFlag: sourceSnapshot.flag,
        targetLanguageCode: targetSnapshot.code,
        targetLanguageLabel: targetSnapshot.label,
        targetLanguageFlag: targetSnapshot.flag,
        retryPayload,
      });
    }

    try {
      const data = await translateVoiceMessage({
        recording,
        sourceLanguage,
        targetLanguage,
      });
      const audioBlob = base64ToBlob(data.audio.base64, data.audio.mimeType);
      const audioUrl = URL.createObjectURL(audioBlob);

      updateMessage(messageId, {
        status: "ready",
        originalText: data.transcript,
        transcript: data.transcript,
        translatedText: data.translatedText,
        audioUrl,
        errorMessage: "",
      });

      return { messageId, audioUrl };
    } catch (translationError) {
      updateMessage(messageId, {
        status: "error",
        errorMessage: translationError.message,
      });
      return { messageId, audioUrl: "" };
    }
  };

  const retryMessage = async (message) => {
    const retryPayload = message.retryPayload;

    if (!retryPayload) {
      return;
    }

    const sourceLanguage = getLanguageOption(retryPayload.sourceLanguageCode);
    const targetLanguage = getLanguageOption(retryPayload.targetLanguageCode);

    if (retryPayload.kind === "text") {
      await sendTextMessage({
        originMode: retryPayload.originMode,
        sender: retryPayload.sender,
        sourceLanguage,
        targetLanguage,
        text: retryPayload.text,
        existingMessageId: message.id,
      });
      return;
    }

    if (retryPayload.kind === "voice" && retryPayload.recordingBlob) {
      await sendVoiceMessage({
        originMode: retryPayload.originMode,
        sender: retryPayload.sender,
        sourceLanguage,
        targetLanguage,
        recording: {
          blob: retryPayload.recordingBlob,
          mimeType: retryPayload.recordingBlob.type,
        },
        existingMessageId: message.id,
      });
    }
  };

  return (
    <main
      className="relative flex min-h-screen w-full select-none flex-col overflow-hidden bg-zinc-950 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900 to-zinc-950 font-sans text-zinc-100"
      style={{ minHeight: "100svh", height: "100dvh" }}
    >
      <ModeSwitcher appMode={appMode} setAppMode={setAppMode} />

      {appMode === "chat" ? (
        <ChatScreen
          myLang={myLang}
          setMyLang={setMyLang}
          theirLang={theirLang}
          setTheirLang={setTheirLang}
          messages={messages}
          sendTextMessage={sendTextMessage}
          sendVoiceMessage={sendVoiceMessage}
          retryMessage={retryMessage}
          onAudioPlay={handleThreadAudioPlay}
        />
      ) : null}

      {appMode === "conversation" ? (
        <ConversationScreen
          myLang={myLang}
          setMyLang={setMyLang}
          theirLang={theirLang}
          setTheirLang={setTheirLang}
          voiceHistory={voiceHistory}
          autoplayAudioUrl={autoplayAudioUrl}
          submitVoiceMessage={sendVoiceMessage}
          replayVoiceMessage={replayVoiceMessage}
        />
      ) : null}

      {appMode === "single" ? (
        <SingleModeScreen
          myLang={myLang}
          setMyLang={setMyLang}
          theirLang={theirLang}
          setTheirLang={setTheirLang}
          voiceHistory={voiceHistory}
          autoplayAudioUrl={autoplayAudioUrl}
          submitVoiceMessage={sendVoiceMessage}
          replayVoiceMessage={replayVoiceMessage}
        />
      ) : null}
    </main>
  );
}
