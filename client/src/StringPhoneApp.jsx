import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import BD from "country-flag-icons/react/3x2/BD";
import BG from "country-flag-icons/react/3x2/BG";
import CN from "country-flag-icons/react/3x2/CN";
import CZ from "country-flag-icons/react/3x2/CZ";
import DE from "country-flag-icons/react/3x2/DE";
import DK from "country-flag-icons/react/3x2/DK";
import ES from "country-flag-icons/react/3x2/ES";
import FI from "country-flag-icons/react/3x2/FI";
import FR from "country-flag-icons/react/3x2/FR";
import GE from "country-flag-icons/react/3x2/GE";
import GR from "country-flag-icons/react/3x2/GR";
import HR from "country-flag-icons/react/3x2/HR";
import HU from "country-flag-icons/react/3x2/HU";
import ID from "country-flag-icons/react/3x2/ID";
import IL from "country-flag-icons/react/3x2/IL";
import IN from "country-flag-icons/react/3x2/IN";
import IR from "country-flag-icons/react/3x2/IR";
import IT from "country-flag-icons/react/3x2/IT";
import JP from "country-flag-icons/react/3x2/JP";
import KR from "country-flag-icons/react/3x2/KR";
import MY from "country-flag-icons/react/3x2/MY";
import NL from "country-flag-icons/react/3x2/NL";
import NO from "country-flag-icons/react/3x2/NO";
import PH from "country-flag-icons/react/3x2/PH";
import PL from "country-flag-icons/react/3x2/PL";
import PT from "country-flag-icons/react/3x2/PT";
import RO from "country-flag-icons/react/3x2/RO";
import RU from "country-flag-icons/react/3x2/RU";
import SA from "country-flag-icons/react/3x2/SA";
import SE from "country-flag-icons/react/3x2/SE";
import SK from "country-flag-icons/react/3x2/SK";
import TH from "country-flag-icons/react/3x2/TH";
import TR from "country-flag-icons/react/3x2/TR";
import UA from "country-flag-icons/react/3x2/UA";
import US from "country-flag-icons/react/3x2/US";
import VN from "country-flag-icons/react/3x2/VN";
import {
  ArrowLeftRight,
  ArrowRight,
  Copy,
  Ear,
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
  getShareInviteMessage,
  getStatusLabel,
  interpolateTemplate,
  useUiStrings,
} from "./uiStrings.js";
import { useAppAuth } from "./AuthContext.jsx";
import {
  clearAuthReturnState,
  readAuthReturnState,
  saveAuthReturnState,
} from "./authReturnState.js";
import {
  buildSharedRoomEventsUrl,
  createSharedRoom,
  fetchSharedRoomSnapshot,
  joinSharedRoom,
  retrySharedRoomMessage,
  SHARED_ROOM_POLL_INTERVAL_MS,
  sendSharedRoomTextMessage,
  updateSharedRoomLanguages,
  sendSharedRoomVoiceMessage,
  shouldPollSharedRoomUpdates,
} from "./sharedRoomApi.js";
import stringPhoneLogo from "./assets/stringphone-logo.png";
import { ChatScreen } from './components/chat/ChatScreen.jsx';
import { translateTextMessage, translateVoiceMessage } from './chatApi.js';
import { formatTimestamp, formatDuration, formatPronunciationGuide } from './utils.js';

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

const LANGUAGE_FLAG_COUNTRY_CODES = {
  en: "US",
  es: "ES",
  fr: "FR",
  de: "DE",
  pt: "PT",
  it: "IT",
  nl: "NL",
  hi: "IN",
  ar: "SA",
  fa: "IR",
  zh: "CN",
  ja: "JP",
  ko: "KR",
  pl: "PL",
  ru: "RU",
  sv: "SE",
  tr: "TR",
  tl: "PH",
  bg: "BG",
  ro: "RO",
  cs: "CZ",
  el: "GR",
  fi: "FI",
  hr: "HR",
  ms: "MY",
  sk: "SK",
  da: "DK",
  ta: "IN",
  uk: "UA",
  hu: "HU",
  no: "NO",
  vi: "VN",
  bn: "BD",
  th: "TH",
  he: "IL",
  ka: "GE",
  id: "ID",
  te: "IN",
  gu: "IN",
  kn: "IN",
  ml: "IN",
  mr: "IN",
  pa: "IN",
};

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
  flag: LANGUAGE_FLAG_COUNTRY_CODES[language.code] ?? language.flag,
}));
const CHAT_ONLY_TEXT_LANGUAGE_CODES = new Set(["fa"]);
const VOICE_MODE_LANGUAGES = LANGUAGES.filter(
  (language) => !CHAT_ONLY_TEXT_LANGUAGE_CODES.has(language.code),
);

const LANGUAGE_BY_CODE = Object.fromEntries(
  LANGUAGES.map((language) => [language.code, language]),
);

const MAX_RECORDING_TIME = 30;

const MODE_OPTIONS = [
  { id: "chat", label: "Chat", Icon: MessageSquare },
  { id: "single", label: "Single", Icon: User },
  { id: "conversation", label: "Conversation", Icon: Users },
];

const FLAG_COMPONENTS = {
  BD,
  BG,
  CN,
  CZ,
  DE,
  DK,
  ES,
  FI,
  FR,
  GE,
  GR,
  HR,
  HU,
  ID,
  IL,
  IN,
  IR,
  IT,
  JP,
  KR,
  MY,
  NL,
  NO,
  PH,
  PL,
  PT,
  RO,
  RU,
  SA,
  SE,
  SK,
  TH,
  TR,
  UA,
  US,
  VN,
};

function LanguageFlag({ countryCode, label, className = "" }) {
  const FlagIcon = FLAG_COMPONENTS[countryCode];

  if (countryCode && FlagIcon) {
    return (
      <FlagIcon
        title={label}
        className={`shrink-0 overflow-hidden rounded-[2px] shadow-[0_0_0_1px_rgba(255,255,255,0.08)] ${className}`.trim()}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-[2px] border border-white/10 bg-white/5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-300 ${className}`.trim()}
    >
      {countryCode}
    </span>
  );
}

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

export function StringPhoneBrand({
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

function FloatingAuthControls({
  appMode,
  myLanguageCode,
  theirLanguageCode,
  joinQueryToken,
}) {
  const { account, isLoaded, isSignedIn, signOut } = useAppAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const navigate = useNavigate();
  const accountLabel = account?.display_name ?? account?.email ?? "Signed in";

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    try {
      setIsSigningOut(true);
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleAuthNavigation = (nextPath) => {
    saveAuthReturnState({
      appMode,
      myLanguageCode,
      theirLanguageCode,
      joinQueryToken,
    });
    navigate(nextPath);
  };

  return (
    <div
      className="absolute right-4 z-50 sm:right-6"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 1.5rem)" }}
    >
      {!isLoaded ? (
        <div className="inline-flex items-center gap-2 rounded-[1rem] border border-white/12 bg-black/35 px-3 py-2 text-[0.72rem] font-medium text-zinc-300 shadow-[0_18px_40px_rgba(0,0,0,0.28)] ring-1 ring-inset ring-white/6 backdrop-blur-xl">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Loading account</span>
        </div>
      ) : isSignedIn ? (
        <div className="inline-flex items-center gap-2 rounded-[1rem] border border-white/12 bg-black/35 px-2 py-2 text-zinc-100 shadow-[0_18px_40px_rgba(0,0,0,0.28)] ring-1 ring-inset ring-white/6 backdrop-blur-xl">
          <div className="hidden items-center gap-2 rounded-[0.8rem] bg-white/[0.04] px-3 py-2 text-[0.72rem] font-medium text-zinc-300 sm:inline-flex">
            <User className="h-3.5 w-3.5" />
            <span>{accountLabel}</span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="inline-flex items-center gap-2 rounded-[0.8rem] border border-white/12 px-3 py-2 text-[0.72rem] font-semibold text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSigningOut ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <User className="h-3.5 w-3.5" />
            )}
            <span>{isSigningOut ? "Logging out" : "Log out"}</span>
          </button>
        </div>
      ) : (
        <div className="inline-flex items-center gap-2 rounded-[1rem] border border-white/12 bg-black/35 px-2 py-2 text-zinc-100 shadow-[0_18px_40px_rgba(0,0,0,0.28)] ring-1 ring-inset ring-white/6 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => handleAuthNavigation("/login")}
            className="inline-flex items-center gap-2 rounded-[0.8rem] border border-white/12 px-3 py-2 text-[0.72rem] font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.06]"
          >
            <span>Log In</span>
          </button>
          <button
            type="button"
            onClick={() => handleAuthNavigation("/signup")}
            className="inline-flex items-center gap-2 rounded-[0.8rem] bg-white px-3 py-2 text-[0.72rem] font-semibold text-zinc-950 transition hover:bg-zinc-100"
          >
            <span>Sign Up</span>
          </button>
        </div>
      )}
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

export function usesChatOnlyTextLanguage(...languages) {
  return languages.some(
    (language) => language && CHAT_ONLY_TEXT_LANGUAGE_CODES.has(language.code),
  );
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

  window.prompt("Copy this invite", text);
  return false;
}

function buildSharedRoomInviteCopy({ inviteUrl, inviteLanguageCode }) {
  const inviteMessage = getShareInviteMessage(inviteLanguageCode || "en");
  return `${inviteMessage}\n${inviteUrl}`;
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
      originalPronunciation: message.originalPronunciation,
      translatedText: message.translatedText,
      translatedPronunciation: message.translatedPronunciation,
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

export function useRecorder() {
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

export function useCountdown({ active, onExpire }) {
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

export function LanguageSelector({
  selected,
  onSelect,
  options = LANGUAGES,
  disabled,
  orientation = "down",
  searchPlaceholder,
  menuAlign = "left",
  containerClassName = "",
  buttonClassName = "",
  mobileFlagOnly = false,
  mobileMenuFixedCenter = false,
  isOpen: controlledIsOpen,
  onOpenChange,
}) {
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuTop, setMobileMenuTop] = useState(0);
  const uiStrings = useUiStrings(selected);
  const isControlled = typeof controlledIsOpen === "boolean";
  const isOpen = isControlled ? controlledIsOpen : uncontrolledIsOpen;
  const buttonRef = useRef(null);

  const filteredLanguages = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((language) =>
      [language.code, language.name, language.englishName].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [options, searchQuery]);

  let positionClasses = "top-full mt-3 left-0";
  if (orientation === "up") {
    positionClasses = "bottom-full mb-3 origin-bottom";
  }

  const effectiveMenuAlign =
    menuAlign === "left" && orientation === "up" ? "center" : menuAlign;

  if (effectiveMenuAlign === "center") {
    positionClasses = `${positionClasses} left-1/2 -translate-x-1/2`;
  } else if (effectiveMenuAlign === "right") {
    positionClasses = `${positionClasses} right-0`;
  } else {
    positionClasses = `${positionClasses} left-0`;
  }

  const desktopPositionClasses =
    orientation === "up"
      ? effectiveMenuAlign === "center"
        ? "sm:absolute sm:bottom-full sm:mb-3 sm:left-1/2 sm:-translate-x-1/2 sm:origin-bottom"
        : effectiveMenuAlign === "right"
          ? "sm:absolute sm:bottom-full sm:mb-3 sm:left-auto sm:right-0 sm:translate-x-0 sm:origin-bottom"
          : "sm:absolute sm:bottom-full sm:mb-3 sm:left-0 sm:translate-x-0 sm:origin-bottom"
      : effectiveMenuAlign === "center"
        ? "sm:absolute sm:top-full sm:mt-3 sm:left-1/2 sm:-translate-x-1/2"
        : effectiveMenuAlign === "right"
          ? "sm:absolute sm:top-full sm:mt-3 sm:left-auto sm:right-0 sm:translate-x-0"
          : "sm:absolute sm:top-full sm:mt-3 sm:left-0 sm:translate-x-0";

  const setSelectorOpen = (nextOpen) => {
    if (!isControlled) {
      setUncontrolledIsOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
  };

  useEffect(() => {
    if (disabled) {
      setSelectorOpen(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !mobileMenuFixedCenter) {
      return undefined;
    }

    const updateMobileMenuPosition = () => {
      if (window.innerWidth >= 640 || !buttonRef.current) {
        return;
      }

      const buttonRect = buttonRef.current.getBoundingClientRect();
      setMobileMenuTop(buttonRect.bottom + 12);
    };

    updateMobileMenuPosition();
    window.addEventListener("resize", updateMobileMenuPosition);

    return () => {
      window.removeEventListener("resize", updateMobileMenuPosition);
    };
  }, [isOpen, mobileMenuFixedCenter]);

  const toggleOpen = () => {
    setSelectorOpen(!isOpen);
  };

  const menuClassName = mobileMenuFixedCenter
    ? `fixed left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-white/10 bg-zinc-900/90 shadow-2xl backdrop-blur-xl ${desktopPositionClasses}`
    : `absolute z-50 rounded-2xl border border-white/10 bg-zinc-900/90 shadow-2xl backdrop-blur-xl ${positionClasses}`;

  const menuStyle = mobileMenuFixedCenter
    ? {
        width: "min(16rem, calc(100vw - 2rem))",
        top:
          typeof window !== "undefined" && window.innerWidth < 640
            ? `${mobileMenuTop}px`
            : undefined,
      }
    : { width: "min(16rem, calc(100vw - 2rem))" };

  return (
    <div
      className={`relative ${containerClassName} ${disabled ? "pointer-events-none opacity-40" : ""}`.trim()}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className={`flex w-full min-w-[112px] items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-white shadow-sm backdrop-blur-md transition-all duration-300 hover:bg-white/10 ${buttonClassName}`.trim()}
      >
        {mobileFlagOnly ? (
          <>
            <LanguageFlag
              countryCode={selected.flag}
              label={selected.name}
              className="h-3.5 w-5 sm:hidden"
            />
            <span className="hidden min-w-0 items-center gap-2 sm:flex">
              <LanguageFlag
                countryCode={selected.flag}
                label={selected.name}
                className="h-3.5 w-5"
              />
              <span className="truncate text-xs font-medium tracking-wide">
                {selected.name}
              </span>
            </span>
          </>
        ) : (
          <span className="flex min-w-0 items-center gap-2">
            <LanguageFlag
              countryCode={selected.flag}
              label={selected.name}
              className="h-3.5 w-5"
            />
            <span className="truncate text-xs font-medium tracking-wide">
              {selected.name}
            </span>
          </span>
        )}
      </button>

      {isOpen && (
        <div className={menuClassName} style={menuStyle}>
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
                  setSelectorOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
                  selected.code === language.code
                    ? "bg-white/10 font-medium text-white"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                }`}
              >
                <LanguageFlag
                  countryCode={language.flag}
                  label={language.name}
                  className="h-4 w-6"
                />
                <span>{language.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AudioWave({ active, colorClass = "bg-zinc-300" }) {
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

export function ErrorNotice({ message, onDismiss }) {
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
  textOnlyChatLocked = false,
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
          const modeBlocked = id !== "chat" && (sharedChatLocked || textOnlyChatLocked);
          const blockedTitle = sharedChatLocked
            ? `${label} unavailable while shared chat is active`
            : "Persian is only available in Chat mode right now";

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
                  ? blockedTitle
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
  languageMenuOpen,
  onLanguageMenuOpenChange,
  languageOptions = LANGUAGES,
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
          options={languageOptions}
          disabled={isLocked || userState !== "idle"}
          orientation={position}
          isOpen={languageMenuOpen}
          onOpenChange={onLanguageMenuOpenChange}
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
  const [openLanguageSelector, setOpenLanguageSelector] = useState(null);
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
        languageOptions={VOICE_MODE_LANGUAGES}
        languageMenuOpen={openLanguageSelector === "top"}
        onLanguageMenuOpenChange={(nextOpen) => {
          setOpenLanguageSelector((currentOpen) =>
            nextOpen ? "top" : currentOpen === "top" ? null : currentOpen,
          );
        }}
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
        languageOptions={VOICE_MODE_LANGUAGES}
        languageMenuOpen={openLanguageSelector === "bottom"}
        onLanguageMenuOpenChange={(nextOpen) => {
          setOpenLanguageSelector((currentOpen) =>
            nextOpen ? "bottom" : currentOpen === "bottom" ? null : currentOpen,
          );
        }}
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
  languageOptions = LANGUAGES,
  languageMenuOpen,
  onLanguageMenuOpenChange,
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
        options={languageOptions}
        orientation="up"
        disabled={status !== "idle"}
        searchPlaceholder={uiStrings.searchLanguages}
        isOpen={languageMenuOpen}
        onOpenChange={onLanguageMenuOpenChange}
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
  const [openLanguageSelector, setOpenLanguageSelector] = useState(null);
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
          languageOptions={VOICE_MODE_LANGUAGES}
          languageMenuOpen={openLanguageSelector === "speak"}
          onLanguageMenuOpenChange={(nextOpen) => {
            setOpenLanguageSelector((currentOpen) =>
              nextOpen ? "speak" : currentOpen === "speak" ? null : currentOpen,
            );
          }}
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
          languageOptions={VOICE_MODE_LANGUAGES}
          languageMenuOpen={openLanguageSelector === "listen"}
          onLanguageMenuOpenChange={(nextOpen) => {
            setOpenLanguageSelector((currentOpen) =>
              nextOpen ? "listen" : currentOpen === "listen" ? null : currentOpen,
            );
          }}
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

export function SharedRoomControls({
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
    const participantCountLabel = `${room?.participantCount ?? 1}/2`;
    const participantLabel = `${participantCountLabel} joined`;
    const isGuestParticipant = roomSession.role === "guest";

    if (isGuestParticipant) {
      return (
        <div className="whitespace-nowrap rounded-full border border-emerald-400/15 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100">
          <span className="sm:hidden">{participantCountLabel}</span>
          <span className="hidden sm:inline">{participantLabel}</span>
        </div>
      );
    }

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
          {roomStatus === "connecting" || roomStatus === "updating" ? (
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
            title="Copy invite"
          >
            <Copy size={14} />
          </button>

          <div className="whitespace-nowrap rounded-full border border-emerald-400/15 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100">
            <span className="sm:hidden">{participantCountLabel}</span>
            <span className="hidden sm:inline">{participantLabel}</span>
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
      title="Create and copy invite"
    >
      {roomStatus === "creating" ? (
        <Loader2 size={14} className="animate-spin text-amber-300" />
      ) : (
        <Share2 size={14} />
      )}
    </button>
  );
}

export default function StringPhoneApp() {
  const { isLoaded: isAuthLoaded } = useAppAuth();
  const [appMode, setAppMode] = useState("chat");
  const [myLang, setMyLang] = useState(LANGUAGES[0]);
  const [theirLang, setTheirLang] = useState(LANGUAGES[1]);
  const [messages, setMessages] = useState([]);
  const messagesRef = useRef(messages);
  const domAudioRef = useRef(null);
  const autoplayAudioRef = useRef(null);
  const initialJoinTokenRef = useRef(getInitialJoinToken());
  const hasRestoredAuthReturnStateRef = useRef(false);
  const attemptedAutoJoinTokenRef = useRef("");
  const sharedRoomAudioUrlCacheRef = useRef(new Map());
  const [pendingInviteToken, setPendingInviteToken] = useState(
    initialJoinTokenRef.current,
  );
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
  const isFarsiChatOnly = usesChatOnlyTextLanguage(myLang, theirLang);
  const sharedRoomInviteUrl =
    sharedRoomSession?.inviteUrl ??
    (pendingInviteToken ? buildSharedRoomInviteUrl(pendingInviteToken) : "");
  const applySharedRoomSnapshotRef = useRef(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!isAuthLoaded || hasRestoredAuthReturnStateRef.current) {
      return;
    }

    hasRestoredAuthReturnStateRef.current = true;

    const savedReturnState = readAuthReturnState();

    if (!savedReturnState) {
      return;
    }

    setAppMode(savedReturnState.appMode);
    setMyLang(getLanguageOption(savedReturnState.myLanguageCode));
    setTheirLang(getLanguageOption(savedReturnState.theirLanguageCode));
    setPendingInviteToken(savedReturnState.joinQueryToken);
    syncSharedRoomInviteToken(savedReturnState.joinQueryToken);
    clearAuthReturnState();
  }, [isAuthLoaded]);

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
    if (!pendingInviteToken || sharedRoomSession) {
      attemptedAutoJoinTokenRef.current = "";
      return;
    }

    if (attemptedAutoJoinTokenRef.current === pendingInviteToken) {
      return;
    }

    attemptedAutoJoinTokenRef.current = pendingInviteToken;
    void handleJoinSharedRoom();
  }, [pendingInviteToken, sharedRoomSession]);

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

  useEffect(() => {
    if (appMode === "chat" || !isFarsiChatOnly) {
      return;
    }

    setAppMode("chat");
    setModeLockNotice({
      id: Date.now(),
      message: "Persian is only available in Chat mode for now.",
    });
  }, [appMode, isFarsiChatOnly]);

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

    if (sharedRoom?.id === sharedRoomSession.roomId && sharedRoomStatus === "active") {
      return undefined;
    }

    let cancelled = false;
    setSharedRoomStatus((currentStatus) =>
      currentStatus === "idle" ? "connecting" : currentStatus,
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

    if (shouldPollSharedRoomUpdates()) {
      const intervalId = window.setInterval(() => {
        fetchSharedRoomSnapshot({
          roomId: sharedRoomSession.roomId,
          participantSessionToken: sharedRoomSession.participantSessionToken,
        })
          .then((payload) => {
            applySharedRoomSnapshotRef.current?.(payload.room, sharedRoomSession);
          })
          .catch(() => {
            setSharedRoomStatus("connecting");
            setSharedRoomError(
              "Live room connection dropped. Trying to reconnect...",
            );
          });
      }, SHARED_ROOM_POLL_INTERVAL_MS);

      return () => {
        window.clearInterval(intervalId);
      };
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
        originalPronunciation: "",
        translatedText: "",
        translatedPronunciation: "",
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
        originalPronunciation: "",
        translatedText: "",
        translatedPronunciation: "",
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
        originalPronunciation: data.originalPronunciation,
        translatedText: data.translatedText,
        translatedPronunciation: data.translatedPronunciation,
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
        originalPronunciation: "",
        translatedText: "",
        translatedPronunciation: "",
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
        originalPronunciation: "",
        translatedText: "",
        translatedPronunciation: "",
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
        originalPronunciation: data.originalPronunciation ?? "",
        transcript: data.transcript,
        translatedText: data.translatedText,
        translatedPronunciation: data.translatedPronunciation ?? "",
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
    if (sharedRoomSession?.role === "guest") {
      return;
    }

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
        const inviteCopy = buildSharedRoomInviteCopy({
          inviteUrl,
          inviteLanguageCode: theirLang.code,
        });
        const copied = await copyTextToClipboard(inviteCopy);

        if (copied) {
          setSharedRoomCopyNotice("Invite copied.");
        }
      } catch {
        setSharedRoomError("Could not copy the invite from this browser.");
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
        displayName: "Guest",
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
    if (sharedRoomSession?.role === "guest") {
      return;
    }

    if (!sharedRoomInviteUrl) {
      return;
    }

    try {
      const inviteCopy = buildSharedRoomInviteCopy({
        inviteUrl: sharedRoomInviteUrl,
        inviteLanguageCode: theirLang.code,
      });
      const copied = await copyTextToClipboard(inviteCopy);

      if (copied) {
        setSharedRoomCopyNotice("Invite copied.");
      }
    } catch {
      setSharedRoomError("Could not copy the invite from this browser.");
    }
  };

  const handleUpdateSharedRoomLanguages = async ({
    nextMyLanguage,
    nextTheirLanguage,
  }) => {
    if (
      !sharedRoomSession ||
      sharedRoomSession.role !== "host" ||
      sharedRoom?.guestJoined
    ) {
      return "passthrough";
    }

    setSharedRoomError("");
    setSharedRoomStatus("updating");

    try {
      const payload = await updateSharedRoomLanguages({
        roomId: sharedRoomSession.roomId,
        participantSessionToken: sharedRoomSession.participantSessionToken,
        hostLanguageCode: nextMyLanguage.code,
        guestLanguageCode: nextTheirLanguage.code,
      });

      applySharedRoomSnapshotRef.current?.(payload.room, sharedRoomSession);
      return "updated";
    } catch (roomError) {
      setSharedRoomError(roomError.message);
      setSharedRoomStatus("active");
      return "failed";
    }
  };

  const handleSelectChatMyLanguage = async (nextLanguage) => {
    if (nextLanguage.code === myLang.code) {
      return;
    }

    const outcome = await handleUpdateSharedRoomLanguages({
      nextMyLanguage: nextLanguage,
      nextTheirLanguage: theirLang,
    });

    if (outcome === "passthrough") {
      setMyLang(nextLanguage);
    }
  };

  const handleSelectChatTheirLanguage = async (nextLanguage) => {
    if (nextLanguage.code === theirLang.code) {
      return;
    }

    const outcome = await handleUpdateSharedRoomLanguages({
      nextMyLanguage: myLang,
      nextTheirLanguage: nextLanguage,
    });

    if (outcome === "passthrough") {
      setTheirLang(nextLanguage);
    }
  };

  const handleInvertChatLanguages = async () => {
    if (myLang.code === theirLang.code) {
      return;
    }

    if (
      sharedRoomSession &&
      (sharedRoomSession.role !== "host" || sharedRoom?.guestJoined)
    ) {
      return;
    }

    const nextMyLanguage = theirLang;
    const nextTheirLanguage = myLang;
    const outcome = await handleUpdateSharedRoomLanguages({
      nextMyLanguage,
      nextTheirLanguage,
    });

    if (outcome === "passthrough") {
      setMyLang(nextMyLanguage);
      setTheirLang(nextTheirLanguage);
    }
  };

  const chatMessages = sharedRoomSession ? sharedRoomMessages : messages;
  const handleBlockedModeChange = () => {
    const message = sharedRoomSession?.role === "guest"
      ? "This shared chat invite only works in Chat mode."
      : sharedRoomSession
        ? "Please untoggle shared chat to use live conversation modes."
        : isFarsiChatOnly
          ? "Persian is only available in Chat mode for now."
          : "Please untoggle shared chat to use live conversation modes.";

    setModeLockNotice({
      id: Date.now(),
      message,
    });
  };

  return (
    <main
      className="relative flex min-h-screen w-full select-none flex-col overflow-hidden bg-zinc-950 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900 to-zinc-950 font-sans text-zinc-100"
      style={{ minHeight: "100svh", height: "100dvh" }}
    >
      <FloatingBrand />
      <FloatingAuthControls
        appMode={appMode}
        myLanguageCode={myLang.code}
        theirLanguageCode={theirLang.code}
        joinQueryToken={pendingInviteToken}
      />
      <ModeSwitcher
        appMode={appMode}
        setAppMode={setAppMode}
        sharedChatLocked={Boolean(sharedRoomSession)}
        textOnlyChatLocked={isFarsiChatOnly}
        onBlockedModeChange={handleBlockedModeChange}
        noticeMessage={modeLockNotice?.message ?? ""}
        onDismissNotice={() => setModeLockNotice(null)}
      />

      {appMode === "chat" ? (
        <ChatScreen
          myLang={myLang}
          setMyLang={handleSelectChatMyLanguage}
          theirLang={theirLang}
          setTheirLang={handleSelectChatTheirLanguage}
          onInvertLanguages={handleInvertChatLanguages}
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
          sharedRoomError={sharedRoomError}
          onDismissSharedRoomCopyNotice={() => setSharedRoomCopyNotice("")}
          onToggleSharedRoom={handleToggleSharedRoom}
          onCopySharedRoomInvite={handleCopySharedRoomInvite}
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
