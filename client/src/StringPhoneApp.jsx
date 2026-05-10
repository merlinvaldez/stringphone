import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Copy,
  Ear,
  Globe,
  Loader2,
  MessageSquare,
  Mic,
  Pause,
  Phone,
  Play,
  Search,
  Send,
  Share2,
  Square,
  User,
  Users,
  Volume2,
} from "lucide-react";
import {
  DEFAULT_UI_STRINGS,
  getStatusLabel,
  interpolateTemplate,
  useUiStrings,
} from "./uiStrings.js";
import {
  buildSharedRoomEventsUrl,
  createSharedRoom,
  fetchSharedRoomSnapshot,
  joinSharedRoom,
  retrySharedRoomMessage,
  sendSharedRoomTextMessage,
  sendSharedRoomVoiceMessage,
} from "./sharedRoomApi.js";
import stringPhoneLogo from "./assets/stringphone-logo.png";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "/api";
const SHARED_ROOM_SESSION_STORAGE_KEY = "stringphone-shared-room-session-v1";
const SHARED_ROOM_JOIN_QUERY_PARAM = "join";

const RAW_LANGUAGES = [
  { code: "en", englishName: "English", flag: "\uD83C\uDDFA\uD83C\uDDF8" },
  { code: "es", englishName: "Spanish", flag: "\uD83C\uDDEA\uD83C\uDDF8" },
  { code: "fr", englishName: "French", flag: "\uD83C\uDDEB\uD83C\uDDF7" },
  { code: "de", englishName: "German", flag: "\uD83C\uDDE9\uD83C\uDDEA" },
  { code: "pt", englishName: "Portuguese", flag: "\uD83C\uDDF5\uD83C\uDDF9" },
  { code: "it", englishName: "Italian", flag: "\uD83C\uDDEE\uD83C\uDDF9" },
  { code: "nl", englishName: "Dutch", flag: "\uD83C\uDDF3\uD83C\uDDF1" },
  { code: "hi", englishName: "Hindi", flag: "\uD83C\uDDEE\uD83C\uDDF3" },
  { code: "ar", englishName: "Arabic", flag: "\uD83C\uDDF8\uD83C\uDDE6" },
  { code: "fa", englishName: "Persian", flag: "\uD83C\uDDEE\uD83C\uDDF7" },
  { code: "zh", englishName: "Chinese", flag: "CN" },
  { code: "ja", englishName: "Japanese", flag: "JP" },
  { code: "ko", englishName: "Korean", flag: "KR" },
  { code: "pl", englishName: "Polish", flag: "PL" },
  { code: "ru", englishName: "Russian", flag: "RU" },
  { code: "sv", englishName: "Swedish", flag: "SE" },
  { code: "tr", englishName: "Turkish", flag: "TR" },
  { code: "tl", englishName: "Tagalog", flag: "PH" },
  { code: "bg", englishName: "Bulgarian", flag: "BG" },
  { code: "ro", englishName: "Romanian", flag: "RO" },
  { code: "cs", englishName: "Czech", flag: "CZ" },
  { code: "el", englishName: "Greek", flag: "GR" },
  { code: "fi", englishName: "Finnish", flag: "FI" },
  { code: "hr", englishName: "Croatian", flag: "HR" },
  { code: "ms", englishName: "Malay", flag: "MY" },
  { code: "sk", englishName: "Slovak", flag: "SK" },
  { code: "da", englishName: "Danish", flag: "DK" },
  { code: "ta", englishName: "Tamil", flag: "IN" },
  { code: "uk", englishName: "Ukrainian", flag: "UA" },
  { code: "hu", englishName: "Hungarian", flag: "HU" },
  { code: "no", englishName: "Norwegian", flag: "NO" },
  { code: "vi", englishName: "Vietnamese", flag: "VN" },
  { code: "bn", englishName: "Bengali", flag: "BD" },
  { code: "th", englishName: "Thai", flag: "TH" },
  { code: "he", englishName: "Hebrew", flag: "IL" },
  { code: "ka", englishName: "Georgian", flag: "GE" },
  { code: "id", englishName: "Indonesian", flag: "ID" },
  { code: "te", englishName: "Telugu", flag: "IN" },
  { code: "gu", englishName: "Gujarati", flag: "IN" },
  { code: "kn", englishName: "Kannada", flag: "IN" },
  { code: "ml", englishName: "Malayalam", flag: "IN" },
  { code: "mr", englishName: "Marathi", flag: "IN" },
  { code: "pa", englishName: "Punjabi", flag: "IN" },
];

function getNativeLanguageName(code, fallbackName) {
  try {
    const displayName = new Intl.DisplayNames([code], {
      type: "language",
    }).of(code);

    return displayName ?? fallbackName;
  } catch {
    return fallbackName;
  }
}

const LANGUAGES = RAW_LANGUAGES.map((language) => ({
  code: language.code,
  englishName: language.englishName,
  name: getNativeLanguageName(language.code, language.englishName),
  flag: language.flag,
}));

const LANGUAGE_BY_CODE = Object.fromEntries(
  LANGUAGES.map((language) => [language.code, language]),
);

const MAX_RECORDING_TIME = 30;

const MODE_OPTIONS = [
  { id: "chat", label: "Chat", Icon: MessageSquare },
  { id: "single", label: "Single", Icon: User },
  { id: "conversation", label: "Conversation", Icon: Users },
];

function StringPhoneLogoBadge({ className = "", imageClassName = "" }) {
  return (
    <span
      role="img"
      aria-label="StringPhone"
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-white/15 bg-white/[0.03] shadow-[0_18px_40px_rgba(0,0,0,0.32)] ring-1 ring-inset ring-white/5 backdrop-blur-xl ${className}`.trim()}
    >
      <img
        src={stringPhoneLogo}
        alt=""
        className={`object-contain opacity-90 [filter:brightness(0)_invert(1)] ${imageClassName}`.trim()}
      />
    </span>
  );
}

function StringPhoneBrand({
  className = "",
  compact = false,
  withLabel = false,
}) {
  const logoClassName = compact
    ? "h-10 w-10 rounded-[1rem]"
    : withLabel
      ? "h-24 w-24 rounded-[2rem] sm:h-28 sm:w-28"
      : "h-14 w-14 rounded-[1.35rem]";
  const imageClassName = compact
    ? "h-[82%] w-[82%]"
    : withLabel
      ? "h-[84%] w-[84%]"
      : "h-[86%] w-[86%]";

  if (!withLabel) {
    return (
      <StringPhoneLogoBadge
        className={`${logoClassName} ${className}`.trim()}
        imageClassName={`${imageClassName} scale-[1.15]`.trim()}
      />
    );
  }

  return (
    <div className={`inline-flex flex-col items-center gap-4 ${className}`.trim()}>
      <StringPhoneLogoBadge
        className={logoClassName}
        imageClassName={`${imageClassName} scale-[1.18]`.trim()}
      />
      <span className="text-[1.55rem] font-semibold tracking-[0.18em] text-zinc-100 sm:text-[2rem]">
        StringPhone
      </span>
    </div>
  );
}

function FloatingBrand() {
  return (
    <div
      className="absolute left-4 z-50 sm:left-6"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 1.5rem)" }}
    >
      <StringPhoneBrand compact />
    </div>
  );
}

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

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "--:--";
  }

  const totalSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
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

function getInitialJoinToken() {
  if (typeof window === "undefined") {
    return "";
  }

  return (
    new URL(window.location.href).searchParams.get(SHARED_ROOM_JOIN_QUERY_PARAM) ??
    ""
  ).trim();
}

function buildSharedRoomInviteUrl(inviteToken) {
  if (typeof window === "undefined") {
    return inviteToken;
  }

  const url = new URL(window.location.href);
  url.searchParams.set(SHARED_ROOM_JOIN_QUERY_PARAM, inviteToken);
  return url.toString();
}

function syncSharedRoomInviteToken(inviteToken) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);

  if (inviteToken) {
    url.searchParams.set(SHARED_ROOM_JOIN_QUERY_PARAM, inviteToken);
  } else {
    url.searchParams.delete(SHARED_ROOM_JOIN_QUERY_PARAM);
  }

  window.history.replaceState({}, "", url.toString());
}

function readStoredSharedRoomSession() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(
      SHARED_ROOM_SESSION_STORAGE_KEY,
    );

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue);

    if (
      typeof parsed?.roomId !== "string" ||
      typeof parsed?.inviteToken !== "string" ||
      typeof parsed?.inviteUrl !== "string" ||
      typeof parsed?.participantId !== "string" ||
      typeof parsed?.participantSessionToken !== "string" ||
      (parsed?.role !== "host" && parsed?.role !== "guest")
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function persistSharedRoomSession(session) {
  if (typeof window === "undefined") {
    return;
  }

  if (!session) {
    window.sessionStorage.removeItem(SHARED_ROOM_SESSION_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(
    SHARED_ROOM_SESSION_STORAGE_KEY,
    JSON.stringify(session),
  );
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  window.prompt("Copy this join link", text);
  return false;
}

function revokeSharedRoomAudioUrls(audioUrlCacheRef) {
  audioUrlCacheRef.current.forEach(({ url }) => {
    URL.revokeObjectURL(url);
  });
  audioUrlCacheRef.current.clear();
}

function mapSharedRoomMessages({
  rawMessages,
  participantId,
  audioUrlCacheRef,
}) {
  const activeMessageIds = new Set();

  const mappedMessages = rawMessages.map((message) => {
    activeMessageIds.add(message.id);

    let audioUrl = "";
    const existingAudio = audioUrlCacheRef.current.get(message.id);

    if (message.translatedAudio?.base64 && message.translatedAudio?.mimeType) {
      const signature = `${message.translatedAudio.mimeType}:${message.translatedAudio.base64}`;

      if (existingAudio?.signature === signature) {
        audioUrl = existingAudio.url;
      } else {
        if (existingAudio) {
          URL.revokeObjectURL(existingAudio.url);
        }

        const nextAudioUrl = URL.createObjectURL(
          base64ToBlob(
            message.translatedAudio.base64,
            message.translatedAudio.mimeType,
          ),
        );

        audioUrlCacheRef.current.set(message.id, {
          signature,
          url: nextAudioUrl,
        });
        audioUrl = nextAudioUrl;
      }
    } else if (existingAudio) {
      URL.revokeObjectURL(existingAudio.url);
      audioUrlCacheRef.current.delete(message.id);
    }

    const sourceLanguage = getLanguageOption(message.sourceLanguageCode);
    const targetLanguage = getLanguageOption(message.targetLanguageCode);

    return {
      id: message.id,
      roomId: message.roomId,
      kind: message.kind,
      originMode: message.originMode,
      sender: message.authorParticipantId === participantId ? "self" : "partner",
      status: message.status,
      originalText: message.originalText,
      translatedText: message.translatedText,
      transcript: message.transcript,
      audioUrl,
      errorMessage: message.errorMessage,
      sourceLanguageCode: message.sourceLanguageCode,
      sourceLanguageLabel: message.sourceLanguageLabel,
      sourceLanguageFlag: sourceLanguage.flag,
      targetLanguageCode: message.targetLanguageCode,
      targetLanguageLabel: message.targetLanguageLabel,
      targetLanguageFlag: targetLanguage.flag,
      createdAt: message.createdAt,
    };
  });

  for (const [messageId, cachedAudio] of audioUrlCacheRef.current.entries()) {
    if (!activeMessageIds.has(messageId)) {
      URL.revokeObjectURL(cachedAudio.url);
      audioUrlCacheRef.current.delete(messageId);
    }
  }

  return mappedMessages;
}

function deriveSharedRoomLanguages(roomSnapshot, role) {
  if (role === "host") {
    return {
      myLanguage: getLanguageOption(roomSnapshot.hostLanguage.code),
      theirLanguage: getLanguageOption(roomSnapshot.guestLanguage.code),
    };
  }

  return {
    myLanguage: getLanguageOption(roomSnapshot.guestLanguage.code),
    theirLanguage: getLanguageOption(roomSnapshot.hostLanguage.code),
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

function LanguageSelector({
  selected,
  onSelect,
  disabled,
  orientation = "down",
  searchPlaceholder,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const uiStrings = useUiStrings(selected);

  const filteredLanguages = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return LANGUAGES;
    }

    return LANGUAGES.filter((language) =>
      [language.code, language.name, language.englishName].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [searchQuery]);

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

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
    }
  }, [isOpen]);

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
          className={`absolute z-50 w-52 rounded-2xl border border-white/10 bg-zinc-900/90 shadow-2xl backdrop-blur-xl ${positionClasses}`}
        >
          <div className="border-b border-white/5 p-2">
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-zinc-300">
              <Search size={14} className="text-zinc-500" strokeWidth={1.6} />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={searchPlaceholder ?? uiStrings.searchLanguages}
                aria-label={searchPlaceholder ?? uiStrings.searchLanguages}
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
              />
            </label>
          </div>
          <div className="max-h-[42vh] overflow-y-auto p-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {filteredLanguages.map((language) => (
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

function GentleNotice({ message, onDismiss, className = "" }) {
  if (!message) return null;

  return (
    <button
      type="button"
      onClick={onDismiss}
      className={`rounded-full border border-emerald-400/15 bg-zinc-900/85 px-4 py-2 text-xs font-medium text-zinc-200 shadow-xl backdrop-blur-md ${className}`.trim()}
    >
      {message}
    </button>
  );
}

function ModeSwitcher({
  appMode,
  setAppMode,
  sharedChatLocked = false,
  onBlockedModeChange,
  noticeMessage,
  onDismissNotice,
}) {
  return (
    <div
      className="absolute left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 1.5rem)" }}
    >
      <div className="flex gap-1 rounded-full border border-white/10 bg-white/5 p-1.5 shadow-2xl backdrop-blur-xl">
        {MODE_OPTIONS.map(({ id, label, Icon }) => {
          const modeBlocked = sharedChatLocked && id !== "chat";

          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                if (modeBlocked) {
                  onBlockedModeChange?.();
                  return;
                }

                setAppMode(id);
              }}
              aria-label={label}
              aria-pressed={appMode === id}
              className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 sm:h-11 sm:w-11 ${
                appMode === id
                  ? "text-white"
                  : modeBlocked
                    ? "text-zinc-600 hover:text-zinc-500"
                    : "text-zinc-500 hover:text-zinc-300"
              }`}
              title={
                modeBlocked
                  ? `${label} unavailable while shared chat is active`
                  : label
              }
            >
              <Icon size={17} strokeWidth={2.1} />
              {appMode === id && (
                <div className="absolute inset-0 -z-10 rounded-full border border-white/10 bg-white/10 shadow-sm" />
              )}
            </button>
          );
        })}
      </div>

      <GentleNotice message={noticeMessage} onDismiss={onDismissNotice} />
    </div>
  );
}

function MessageStatusPill({ status, uiStrings = DEFAULT_UI_STRINGS }) {
  const statusLabel = getStatusLabel(status, uiStrings);

  if (status === "ready") {
    return null;
  }

  if (status === "error") {
    return (
      <span
        title={statusLabel}
        aria-label={statusLabel}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/10"
      >
        <span className="h-2 w-2 rounded-full bg-rose-300" />
        <span className="sr-only">{statusLabel}</span>
      </span>
    );
  }

  return (
    <span
      title={statusLabel}
      aria-label={statusLabel}
      className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-200"
    >
      <Loader2 size={12} className="animate-spin" />
      <span className="sr-only">{statusLabel}</span>
    </span>
  );
}

function ChatEmptyState() {
  return (
    <div className="flex h-full min-h-[18rem] items-center justify-center">
      <StringPhoneBrand withLabel className="animate-fade-in" />
    </div>
  );
}

function VoiceMessagePlayer({ audioUrl, onAudioPlay, isSelf, uiStrings }) {
  const audioRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const accentClass = isSelf ? "text-emerald-200" : "text-zinc-200";
  const trackClass = isSelf ? "stroke-emerald-300/25" : "stroke-white/15";
  const progressClass = isSelf ? "stroke-emerald-300" : "stroke-indigo-300";
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const remainingSeconds =
    duration > 0 ? Math.max(duration - currentTime, 0) : 0;
  const progress =
    duration > 0 ? Math.max(remainingSeconds / duration, 0) : 0;
  const dashOffset = circumference * (1 - progress);

  const syncDuration = (audioElement) => {
    if (!audioElement) {
      return;
    }

    if (Number.isFinite(audioElement.duration)) {
      setDuration(audioElement.duration);
    }
  };

  const togglePlayback = async () => {
    const audioElement = audioRef.current;

    if (!audioElement) {
      return;
    }

    if (audioElement.paused) {
      try {
        await audioElement.play();
      } catch {
        setIsPlaying(false);
      }
      return;
    }

    audioElement.pause();
  };

  return (
    <div className="flex items-center gap-2">
      <span
        className={`min-w-[2.8rem] text-right text-[11px] font-semibold tabular-nums tracking-[0.12em] ${accentClass}`}
      >
        {formatDuration(isPlaying ? remainingSeconds : duration)}
      </span>

      <button
        type="button"
        onClick={() => {
          void togglePlayback();
        }}
        className={`relative flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/20 transition hover:bg-black/30 ${accentClass}`}
        title={isPlaying ? uiStrings.pauseAudio : uiStrings.playAudio}
      >
        <svg
          viewBox="0 0 44 44"
          className="absolute inset-0 h-full w-full -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            strokeWidth="2.5"
            className={trackClass}
          />
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className={progressClass}
          />
        </svg>
        {isPlaying ? (
          <Pause size={16} className="relative z-10" fill="currentColor" />
        ) : (
          <Play size={16} className="relative z-10 translate-x-[1px]" fill="currentColor" />
        )}
      </button>

      <audio
        ref={audioRef}
        preload="metadata"
        src={audioUrl}
        onLoadedMetadata={(event) => syncDuration(event.currentTarget)}
        onDurationChange={(event) => syncDuration(event.currentTarget)}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
        }}
        onPlay={(event) => {
          setIsPlaying(true);
          onAudioPlay(event.currentTarget);
        }}
        onPause={() => {
          setIsPlaying(false);
        }}
        onEnded={(event) => {
          event.currentTarget.currentTime = 0;
          setCurrentTime(0);
          setIsPlaying(false);
        }}
        className="hidden"
      />
    </div>
  );
}

function MessageBubble({ message, onRetry, onAudioPlay, uiStrings }) {
  const isSelf = message.sender === "self";
  const isVoice = message.kind === "voice";
  const bubbleClasses = isSelf
    ? "ml-auto border-emerald-500/20 bg-emerald-500/10"
    : "mr-auto border-white/10 bg-zinc-900/90";

  return (
    <article className={`flex w-full ${isSelf ? "justify-end" : "justify-start"}`}>
      <div className="w-full max-w-[88%] sm:max-w-[78%]">
        <div
          className={`rounded-[1.75rem] border px-4 py-3 shadow-xl backdrop-blur-md ${bubbleClasses}`}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <span className="pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {formatTimestamp(message.createdAt)}
            </span>
            {isVoice && message.audioUrl ? (
              <VoiceMessagePlayer
                audioUrl={message.audioUrl}
                onAudioPlay={onAudioPlay}
                isSelf={isSelf}
                uiStrings={uiStrings}
              />
            ) : (
              <MessageStatusPill status={message.status} uiStrings={uiStrings} />
            )}
          </div>

          {isVoice ? (
            <div className="space-y-3">
              {message.transcript ? (
                <div>
                  <p className="text-sm leading-6 text-white">
                    {message.transcript}
                  </p>
                </div>
              ) : message.status !== "error" ? (
                <p className="text-sm leading-6 text-zinc-400">
                  {uiStrings.preparingAudio}
                </p>
              ) : null}

              {message.translatedText ? (
                <div className="border-t border-white/10 pt-3">
                  <p className="text-sm leading-6 text-zinc-200">
                    {message.translatedText}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-sm leading-6 text-white">
                  {message.originalText}
                </p>
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-sm leading-6 text-zinc-200">
                  {message.translatedText ||
                    (message.status === "error"
                      ? uiStrings.translationFailed
                      : uiStrings.translatingShort)}
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
                {uiStrings.retry}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ChatThread({ messages, onRetry, onAudioPlay, uiStrings }) {
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
            uiStrings={uiStrings}
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
  const uiStrings = useUiStrings(language);
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
                ? uiStrings.listening
                : userState === "processing"
                  ? uiStrings.translating
                  : uiStrings.speaking}
            </span>
          ) : null}

          {isLocked && !isActiveSpeaker ? (
            <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              {uiStrings.partnersTurn}
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
                  {uiStrings.tap}
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
        <StringPhoneBrand
          compact
          className="relative z-10 whitespace-nowrap landscape:-rotate-90"
        />
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
  Icon,
  language,
  setLanguage,
  uiStrings,
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
                {action === "speak" ? uiStrings.speak : uiStrings.listen}
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
        searchPlaceholder={uiStrings.searchLanguages}
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
  const screenLanguage = activeAction === "listen" ? theirLang : myLang;
  const screenUiStrings = useUiStrings(screenLanguage);
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
                {screenUiStrings.translating}
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
              <StringPhoneBrand withLabel className="animate-fade-in" />
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
          Icon={Mic}
          language={myLang}
          setLanguage={setMyLang}
          uiStrings={screenUiStrings}
          status={flow.status}
          activeAction={activeAction}
          color="rose"
          onStart={() => flow.startRecording({ action: "speak" })}
          onStop={flow.stopRecording}
        />
        <ActionColumn
          action="listen"
          Icon={Ear}
          language={theirLang}
          setLanguage={setTheirLang}
          uiStrings={screenUiStrings}
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

function SharedRoomControls({
  roomSession,
  room,
  roomStatus,
  pendingInviteToken,
  disabled,
  copyNoticeMessage,
  onDismissCopyNotice,
  onToggleRoom,
  onCopyInviteLink,
}) {
  const [controlsExpanded, setControlsExpanded] = useState(false);

  useEffect(() => {
    if (!roomSession) {
      setControlsExpanded(false);
      return undefined;
    }

    setControlsExpanded(false);
    const frameId = window.requestAnimationFrame(() => {
      setControlsExpanded(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [roomSession]);

  if (pendingInviteToken && !roomSession) {
    return null;
  }

  if (roomSession) {
    const participantLabel = `${room?.participantCount ?? 1}/2 joined`;

    return (
      <div className="relative flex items-start">
        <button
          type="button"
          onClick={() => {
            void onToggleRoom();
          }}
          className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-400 text-zinc-950 shadow-lg transition duration-300 hover:bg-emerald-300"
          title="Untoggle shared chat"
        >
          {roomStatus === "connecting" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Share2 size={14} />
          )}
        </button>

        <div
          className={`flex items-center gap-2 overflow-hidden pl-2 transition-all duration-300 ease-out ${
            controlsExpanded
              ? "max-w-xs translate-x-0 opacity-100"
              : "max-w-0 translate-x-2 opacity-0"
          }`}
        >
          <button
            type="button"
            onClick={() => {
              void onCopyInviteLink();
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-zinc-900/80 text-zinc-200 shadow-lg transition duration-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            title="Copy join link"
          >
            <Copy size={14} />
          </button>

          <div className="whitespace-nowrap rounded-full border border-emerald-400/15 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100">
            {participantLabel}
          </div>
        </div>

        <div
          className={`absolute left-0 top-full mt-2 transition-all duration-200 ${
            copyNoticeMessage
              ? "translate-y-0 opacity-100"
              : "-translate-y-1 opacity-0"
          }`}
        >
          <GentleNotice
            message={copyNoticeMessage}
            onDismiss={onDismissCopyNotice}
            className="border-emerald-500/20 bg-zinc-900/92 text-emerald-100 shadow-[0_14px_32px_rgba(0,0,0,0.38)]"
          />
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        void onToggleRoom();
      }}
      disabled={disabled || roomStatus === "creating"}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-zinc-900/80 text-zinc-100 shadow-lg transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
      title="Create and copy join link"
    >
      {roomStatus === "creating" ? (
        <Loader2 size={14} className="animate-spin text-amber-300" />
      ) : (
        <Share2 size={14} />
      )}
    </button>
  );
}

function ChatHeader({
  myLang,
  setMyLang,
  theirLang,
  setTheirLang,
  disabled,
  uiStrings,
  sharedRoomSession,
  sharedRoom,
  sharedRoomStatus,
  sharedRoomInviteUrl,
  pendingInviteToken,
  sharedRoomCopyNotice,
  onDismissSharedRoomCopyNotice,
  onToggleSharedRoom,
  onCopySharedRoomInvite,
}) {
  return (
    <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-start gap-3 px-1">
      <div />

      <div className="flex flex-wrap items-center justify-center gap-3">
        <LanguageSelector
          selected={myLang}
          onSelect={setMyLang}
          disabled={disabled || Boolean(sharedRoomSession)}
          searchPlaceholder={uiStrings.searchLanguages}
        />
        <ArrowRight size={14} className="text-zinc-500" strokeWidth={1.7} />
        <LanguageSelector
          selected={theirLang}
          onSelect={setTheirLang}
          disabled={disabled || Boolean(sharedRoomSession)}
          searchPlaceholder={uiStrings.searchLanguages}
        />
      </div>

      <div className="justify-self-end">
        <SharedRoomControls
          roomSession={sharedRoomSession}
          room={sharedRoom}
          roomStatus={sharedRoomStatus}
          pendingInviteToken={pendingInviteToken}
          disabled={disabled}
          copyNoticeMessage={sharedRoomCopyNotice}
          onDismissCopyNotice={onDismissSharedRoomCopyNotice}
          onToggleRoom={onToggleSharedRoom}
          onCopyInviteLink={onCopySharedRoomInvite}
        />
      </div>
    </div>
  );
}

function SharedRoomJoinCard({
  displayName,
  setDisplayName,
  joinToken,
  joining,
  onJoin,
  onDismiss,
}) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-zinc-900/85 p-5 shadow-2xl backdrop-blur-xl">
      <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">
        <MessageSquare size={12} className="text-emerald-300" />
        Live room invite
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">
            Join this shared chat
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            This beta shares Chat mode between two devices on the current Express
            server.
          </p>
        </div>

        <label className="block">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Your name
          </span>
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Guest"
            disabled={joining}
            className="h-12 w-full rounded-[1.25rem] border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>

        <div className="flex items-center justify-between gap-3 rounded-[1.25rem] border border-white/10 bg-black/20 px-4 py-3 text-xs text-zinc-400">
          <span className="uppercase tracking-[0.2em]">Invite token</span>
          <span className="font-mono text-zinc-300">
            {joinToken.slice(0, 10)}...
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            void onJoin();
          }}
          disabled={joining}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-500 text-sm font-semibold text-zinc-950 shadow-[0_0_30px_rgba(16,185,129,0.25)] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {joining ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Users size={16} />
          )}
          Join live room
        </button>

        <button
          type="button"
          onClick={onDismiss}
          disabled={joining}
          className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue locally
        </button>
      </div>
    </div>
  );
}

function ChatComposer({
  text,
  setText,
  recordingStatus,
  recordingTimer,
  sourceLanguage,
  uiStrings,
  onSendText,
  onStartRecording,
  onStopRecording,
  disabled = false,
  disabledPlaceholder = "",
}) {
  const hasText = text.trim().length > 0;
  const canSendText = hasText && recordingStatus === "idle" && !disabled;
  const actionKind =
    recordingStatus === "recording" ? "stop" : hasText ? "send" : "mic";

  const actionProps =
    actionKind === "stop"
      ? {
          onClick: onStopRecording,
          title: uiStrings.stopVoiceNote,
          className:
            "bg-rose-600 text-white shadow-[0_0_30px_rgba(244,63,94,0.35)]",
          icon: <Square size={18} fill="currentColor" />,
          disabled: false,
        }
      : actionKind === "send"
        ? {
            onClick: onSendText,
            title: uiStrings.sendTextMessage,
            className:
              "bg-emerald-500 text-zinc-950 shadow-[0_0_30px_rgba(16,185,129,0.35)] hover:bg-emerald-400",
            icon: <Send size={18} />,
            disabled: false,
          }
        : {
            onClick: onStartRecording,
            title: uiStrings.recordVoiceNote,
            className:
              "border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10",
            icon: <Mic size={18} />,
            disabled: recordingStatus === "processing",
          };

  return (
    <div className="mt-4 rounded-[2rem] border border-white/10 bg-zinc-900/80 p-3 shadow-2xl backdrop-blur-xl sm:p-4">
      {recordingStatus !== "idle" ? (
        <div className="mb-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-sm text-zinc-200">
            {recordingStatus === "recording"
              ? interpolateTemplate(uiStrings.secondsLeft, {
                  seconds: recordingTimer,
                })
              : uiStrings.translatingVoiceNote}
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
           disabled={recordingStatus !== "idle" || disabled}
           placeholder={
             disabled
               ? disabledPlaceholder
               : interpolateTemplate(uiStrings.messageIn, {
                   language: sourceLanguage.name,
                 })
           }
           className="h-14 flex-1 rounded-[1.5rem] border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
         />

         <button
           type="button"
           onClick={actionProps.onClick}
           disabled={actionProps.disabled || disabled}
           className={`flex h-14 w-14 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${actionProps.className}`}
           title={actionProps.title}
         >
          {actionProps.icon}
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
  submitTextMessage,
  submitVoiceMessage,
  retryMessage,
  onAudioPlay,
  sharedRoomSession,
  sharedRoom,
  sharedRoomStatus,
  sharedRoomInviteUrl,
  pendingInviteToken,
  sharedRoomCopyNotice,
  sharedRoomJoinName,
  setSharedRoomJoinName,
  sharedRoomError,
  onDismissSharedRoomCopyNotice,
  onToggleSharedRoom,
  onJoinSharedRoom,
  onCopySharedRoomInvite,
  onDismissSharedRoomInvite,
}) {
  const recorder = useRecorder();
  const mountedRef = useRef(true);
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

  const sourceLanguage = myLang;
  const targetLanguage = theirLang;
  const screenUiStrings = useUiStrings(sourceLanguage);
  const showJoinCard = Boolean(pendingInviteToken) && !sharedRoomSession;
  const liveRoomBusy =
    sharedRoomStatus === "creating" ||
    sharedRoomStatus === "joining" ||
    sharedRoomStatus === "connecting";
  const composerDisabled = showJoinCard || (Boolean(sharedRoomSession) && sharedRoomStatus !== "active");
  const composerDisabledPlaceholder = showJoinCard
    ? "Join the live room to start messaging"
    : sharedRoomStatus === "connecting"
      ? "Live room is reconnecting..."
      : "";

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

    await submitTextMessage({
      sourceLanguage,
      targetLanguage,
      text,
      originMode: "chat",
      sender: "self",
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

      await submitVoiceMessage({
        sourceLanguage,
        targetLanguage,
        recording,
        originMode: "chat",
        sender: "self",
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
        disabled={status !== "idle" || liveRoomBusy}
        uiStrings={screenUiStrings}
        sharedRoomSession={sharedRoomSession}
        sharedRoom={sharedRoom}
        sharedRoomStatus={sharedRoomStatus}
        sharedRoomInviteUrl={sharedRoomInviteUrl}
        pendingInviteToken={pendingInviteToken}
        sharedRoomCopyNotice={sharedRoomCopyNotice}
        onDismissSharedRoomCopyNotice={onDismissSharedRoomCopyNotice}
        onToggleSharedRoom={onToggleSharedRoom}
        onCopySharedRoomInvite={onCopySharedRoomInvite}
      />

      {showJoinCard ? (
        <div className="mb-4">
          <SharedRoomJoinCard
            displayName={sharedRoomJoinName}
            setDisplayName={setSharedRoomJoinName}
            joinToken={pendingInviteToken}
            joining={sharedRoomStatus === "joining"}
            onJoin={onJoinSharedRoom}
            onDismiss={onDismissSharedRoomInvite}
          />
        </div>
      ) : null}

      {sharedRoomError ? (
        <div className="mb-3 rounded-[1.4rem] border border-rose-500/20 bg-rose-950/40 px-4 py-3 text-sm text-rose-100">
          {sharedRoomError}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <ChatThread
          messages={messages}
          onRetry={retryMessage}
          onAudioPlay={onAudioPlay}
          uiStrings={screenUiStrings}
        />
      </div>

      <ChatComposer
        text={composerText}
        setText={setComposerText}
        recordingStatus={status}
        recordingTimer={recordingTimer}
        sourceLanguage={sourceLanguage}
        uiStrings={screenUiStrings}
        onSendText={handleSendText}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        disabled={composerDisabled}
        disabledPlaceholder={composerDisabledPlaceholder}
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
  const initialJoinTokenRef = useRef(getInitialJoinToken());
  const sharedRoomAudioUrlCacheRef = useRef(new Map());
  const [pendingInviteToken, setPendingInviteToken] = useState(
    initialJoinTokenRef.current,
  );
  const [sharedRoomJoinName, setSharedRoomJoinName] = useState("Guest");
  const [sharedRoomSession, setSharedRoomSession] = useState(() => {
    const storedSession = readStoredSharedRoomSession();

    if (!storedSession) {
      return null;
    }

    if (
      initialJoinTokenRef.current &&
      storedSession.inviteToken !== initialJoinTokenRef.current
    ) {
      persistSharedRoomSession(null);
      return null;
    }

    return storedSession;
  });
  const [sharedRoomStatus, setSharedRoomStatus] = useState(() =>
    readStoredSharedRoomSession() ? "connecting" : "idle",
  );
  const [sharedRoom, setSharedRoom] = useState(null);
  const [sharedRoomMessages, setSharedRoomMessages] = useState([]);
  const [sharedRoomError, setSharedRoomError] = useState("");
  const [sharedRoomCopyNotice, setSharedRoomCopyNotice] = useState("");
  const [modeLockNotice, setModeLockNotice] = useState(null);
  const sharedRoomInviteUrl =
    sharedRoomSession?.inviteUrl ??
    (pendingInviteToken ? buildSharedRoomInviteUrl(pendingInviteToken) : "");
  const applySharedRoomSnapshotRef = useRef(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    persistSharedRoomSession(sharedRoomSession);
  }, [sharedRoomSession]);

  useEffect(() => {
    if (!sharedRoomCopyNotice) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSharedRoomCopyNotice("");
    }, 1800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [sharedRoomCopyNotice]);

  useEffect(() => {
    if (!modeLockNotice) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setModeLockNotice(null);
    }, 2600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [modeLockNotice]);

  applySharedRoomSnapshotRef.current = (roomSnapshot, session = sharedRoomSession) => {
    if (!session) {
      return;
    }

    const { myLanguage, theirLanguage } = deriveSharedRoomLanguages(
      roomSnapshot,
      session.role,
    );

    setSharedRoom(roomSnapshot);
    setSharedRoomMessages(
      mapSharedRoomMessages({
        rawMessages: roomSnapshot.messages,
        participantId: session.participantId,
        audioUrlCacheRef: sharedRoomAudioUrlCacheRef,
      }),
    );
    setMyLang(myLanguage);
    setTheirLang(theirLanguage);
    setSharedRoomStatus("active");
    setSharedRoomError("");
  };

  useEffect(
    () => () => {
      messagesRef.current.forEach((message) => {
        if (message.audioUrl) {
          URL.revokeObjectURL(message.audioUrl);
        }
      });

      autoplayAudioRef.current?.pause();
      domAudioRef.current?.pause();
      revokeSharedRoomAudioUrls(sharedRoomAudioUrlCacheRef);
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

  useEffect(() => {
    if (!sharedRoomSession) {
      setSharedRoomStatus("idle");
      setSharedRoom(null);
      setSharedRoomMessages([]);
      revokeSharedRoomAudioUrls(sharedRoomAudioUrlCacheRef);
      return;
    }

    let cancelled = false;
    setSharedRoomStatus((currentStatus) =>
      currentStatus === "active" ? "connecting" : currentStatus,
    );

    fetchSharedRoomSnapshot({
      roomId: sharedRoomSession.roomId,
      participantSessionToken: sharedRoomSession.participantSessionToken,
    })
      .then((payload) => {
        if (!cancelled) {
          applySharedRoomSnapshotRef.current?.(payload.room, sharedRoomSession);
        }
      })
      .catch((snapshotError) => {
        if (cancelled) {
          return;
        }

        setSharedRoomError(snapshotError.message);
        setSharedRoomStatus("idle");
        setSharedRoomSession(null);
      });

    return () => {
      cancelled = true;
    };
  }, [
    sharedRoomSession?.participantId,
    sharedRoomSession?.participantSessionToken,
    sharedRoomSession?.role,
    sharedRoomSession?.roomId,
  ]);

  useEffect(() => {
    if (!sharedRoomSession) {
      return undefined;
    }

    const eventSource = new EventSource(
      buildSharedRoomEventsUrl({
        roomId: sharedRoomSession.roomId,
        participantSessionToken: sharedRoomSession.participantSessionToken,
      }),
    );

    const handleSnapshot = (event) => {
      try {
        const payload = JSON.parse(event.data);
        applySharedRoomSnapshotRef.current?.(payload.room, sharedRoomSession);
      } catch {
        setSharedRoomError("Received an invalid live room update.");
      }
    };

    const handleError = () => {
      setSharedRoomStatus("connecting");
      setSharedRoomError("Live room connection dropped. Trying to reconnect...");
    };

    eventSource.addEventListener("snapshot", handleSnapshot);
    eventSource.addEventListener("error", handleError);
    eventSource.onerror = handleError;

    return () => {
      eventSource.removeEventListener("snapshot", handleSnapshot);
      eventSource.removeEventListener("error", handleError);
      eventSource.close();
    };
  }, [
    sharedRoomSession?.participantId,
    sharedRoomSession?.participantSessionToken,
    sharedRoomSession?.role,
    sharedRoomSession?.roomId,
  ]);

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

  const submitChatTextMessage = async ({
    originMode,
    sender,
    sourceLanguage,
    targetLanguage,
    text,
  }) => {
    if (sharedRoomSession) {
      return sendSharedRoomTextMessage({
        roomId: sharedRoomSession.roomId,
        participantSessionToken: sharedRoomSession.participantSessionToken,
        text,
      });
    }

    return sendTextMessage({
      originMode,
      sender,
      sourceLanguage,
      targetLanguage,
      text,
    });
  };

  const submitChatVoiceMessage = async ({
    originMode,
    sender,
    sourceLanguage,
    targetLanguage,
    recording,
  }) => {
    if (sharedRoomSession) {
      return sendSharedRoomVoiceMessage({
        roomId: sharedRoomSession.roomId,
        participantSessionToken: sharedRoomSession.participantSessionToken,
        recording,
      });
    }

    return sendVoiceMessage({
      originMode,
      sender,
      sourceLanguage,
      targetLanguage,
      recording,
    });
  };

  const retryChatMessage = async (message) => {
    if (sharedRoomSession && message.roomId) {
      await retrySharedRoomMessage({
        roomId: sharedRoomSession.roomId,
        participantSessionToken: sharedRoomSession.participantSessionToken,
        messageId: message.id,
      });
      return;
    }

    await retryMessage(message);
  };

  const leaveSharedRoom = () => {
    setSharedRoomCopyNotice("");
    setModeLockNotice(null);
    setSharedRoomError("");
    setSharedRoomStatus("idle");
    setSharedRoomSession(null);
    setPendingInviteToken("");
    syncSharedRoomInviteToken("");
  };

  const handleToggleSharedRoom = async () => {
    if (sharedRoomSession) {
      leaveSharedRoom();
      return;
    }

    try {
      setSharedRoomError("");
      setSharedRoomStatus("creating");

      const payload = await createSharedRoom({
        hostLanguageCode: myLang.code,
        guestLanguageCode: theirLang.code,
      });
      const inviteUrl = buildSharedRoomInviteUrl(payload.inviteToken);
      const nextSession = {
        roomId: payload.room.id,
        inviteToken: payload.inviteToken,
        inviteUrl,
        participantId: payload.participant.id,
        participantSessionToken: payload.participantSessionToken,
        role: payload.participant.role,
      };

      setPendingInviteToken(payload.inviteToken);
      syncSharedRoomInviteToken(payload.inviteToken);
      setSharedRoomSession(nextSession);
      applySharedRoomSnapshotRef.current?.(payload.room, nextSession);
      setAppMode("chat");

      try {
        const copied = await copyTextToClipboard(inviteUrl);

        if (copied) {
          setSharedRoomCopyNotice("Join link copied.");
        }
      } catch {
        setSharedRoomError("Could not copy the join link from this browser.");
      }
    } catch (roomError) {
      setSharedRoomStatus("idle");
      setSharedRoomError(roomError.message);
    }
  };

  const handleJoinSharedRoom = async () => {
    if (!pendingInviteToken || sharedRoomSession) {
      return;
    }

    try {
      setSharedRoomError("");
      setSharedRoomStatus("joining");

      const payload = await joinSharedRoom({
        inviteToken: pendingInviteToken,
        displayName: sharedRoomJoinName,
      });
      const inviteUrl = buildSharedRoomInviteUrl(payload.inviteToken);
      const nextSession = {
        roomId: payload.room.id,
        inviteToken: payload.inviteToken,
        inviteUrl,
        participantId: payload.participant.id,
        participantSessionToken: payload.participantSessionToken,
        role: payload.participant.role,
      };

      syncSharedRoomInviteToken(payload.inviteToken);
      setSharedRoomSession(nextSession);
      applySharedRoomSnapshotRef.current?.(payload.room, nextSession);
      setAppMode("chat");
    } catch (roomError) {
      setSharedRoomStatus("idle");
      setSharedRoomError(roomError.message);
    }
  };

  const handleCopySharedRoomInvite = async () => {
    if (!sharedRoomInviteUrl) {
      return;
    }

    try {
      const copied = await copyTextToClipboard(sharedRoomInviteUrl);

      if (copied) {
        setSharedRoomCopyNotice("Join link copied.");
      }
    } catch {
      setSharedRoomError("Could not copy the join link from this browser.");
    }
  };

  const handleDismissSharedRoomInvite = () => {
    setPendingInviteToken("");
    setSharedRoomError("");
    syncSharedRoomInviteToken("");
  };

  const chatMessages = sharedRoomSession ? sharedRoomMessages : messages;
  const handleBlockedModeChange = () => {
    setModeLockNotice({
      id: Date.now(),
      message: "Please untoggle shared chat to use live conversation modes.",
    });
  };

  return (
    <main
      className="relative flex min-h-screen w-full select-none flex-col overflow-hidden bg-zinc-950 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900 to-zinc-950 font-sans text-zinc-100"
      style={{ minHeight: "100svh", height: "100dvh" }}
    >
      <FloatingBrand />
      <ModeSwitcher
        appMode={appMode}
        setAppMode={setAppMode}
        sharedChatLocked={Boolean(sharedRoomSession)}
        onBlockedModeChange={handleBlockedModeChange}
        noticeMessage={modeLockNotice?.message ?? ""}
        onDismissNotice={() => setModeLockNotice(null)}
      />

      {appMode === "chat" ? (
        <ChatScreen
          myLang={myLang}
          setMyLang={setMyLang}
          theirLang={theirLang}
          setTheirLang={setTheirLang}
          messages={chatMessages}
          submitTextMessage={submitChatTextMessage}
          submitVoiceMessage={submitChatVoiceMessage}
          retryMessage={retryChatMessage}
          onAudioPlay={handleThreadAudioPlay}
          sharedRoomSession={sharedRoomSession}
          sharedRoom={sharedRoom}
          sharedRoomStatus={sharedRoomStatus}
          sharedRoomInviteUrl={sharedRoomInviteUrl}
          pendingInviteToken={pendingInviteToken}
          sharedRoomCopyNotice={sharedRoomCopyNotice}
          sharedRoomJoinName={sharedRoomJoinName}
          setSharedRoomJoinName={setSharedRoomJoinName}
          sharedRoomError={sharedRoomError}
          onDismissSharedRoomCopyNotice={() => setSharedRoomCopyNotice("")}
          onToggleSharedRoom={handleToggleSharedRoom}
          onJoinSharedRoom={handleJoinSharedRoom}
          onCopySharedRoomInvite={handleCopySharedRoomInvite}
          onDismissSharedRoomInvite={handleDismissSharedRoomInvite}
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
