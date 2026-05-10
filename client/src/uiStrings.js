import { useEffect, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "/api";

export const DEFAULT_UI_STRINGS = {
  searchLanguages: "Search languages",
  you: "You",
  partner: "Partner",
  listening: "Listening",
  translating: "Translating",
  speaking: "Speaking",
  partnersTurn: "Partner's turn",
  tap: "Tap",
  speak: "Speak",
  listen: "Listen",
  messageIn: "Type message in {language}",
  translatingVoiceNote: "Translating voice note...",
  secondsLeft: "{seconds}s left",
  recordVoiceNote: "Record voice note",
  stopVoiceNote: "Stop voice note",
  sendTextMessage: "Send text message",
  playAudio: "Play audio",
  pauseAudio: "Pause audio",
  audioUnavailable: "Audio unavailable.",
  preparingAudio: "Preparing audio...",
  translationFailed: "Translation failed.",
  translatingShort: "Translating...",
  retry: "Retry",
  pending: "Pending",
  transcribing: "Transcribing",
  generatingAudio: "Generating audio",
  ready: "Ready",
  needsRetry: "Needs retry",
};

const uiStringCache = new Map([["en", DEFAULT_UI_STRINGS]]);
const uiStringInflight = new Map();

export function interpolateTemplate(template, variables) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

async function fetchUiStrings(languageCode) {
  if (uiStringCache.has(languageCode)) {
    return uiStringCache.get(languageCode);
  }

  if (uiStringInflight.has(languageCode)) {
    return uiStringInflight.get(languageCode);
  }

  const request = fetch(`${API_BASE_URL}/ui/translations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ targetLanguage: languageCode }),
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("Failed to load UI strings.");
      }

      const payload = await response.json();
      const strings = payload.strings ?? DEFAULT_UI_STRINGS;
      uiStringCache.set(languageCode, strings);
      return strings;
    })
    .catch(() => DEFAULT_UI_STRINGS)
    .finally(() => {
      uiStringInflight.delete(languageCode);
    });

  uiStringInflight.set(languageCode, request);
  return request;
}

export function useUiStrings(language) {
  const languageCode = language?.code ?? "en";
  const [strings, setStrings] = useState(
    uiStringCache.get(languageCode) ?? DEFAULT_UI_STRINGS,
  );

  useEffect(() => {
    let cancelled = false;
    const cachedStrings = uiStringCache.get(languageCode);

    if (cachedStrings) {
      setStrings(cachedStrings);
    }

    fetchUiStrings(languageCode).then((loadedStrings) => {
      if (!cancelled) {
        setStrings(loadedStrings);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [languageCode]);

  return strings;
}

export function getStatusLabel(status, uiStrings = DEFAULT_UI_STRINGS) {
  switch (status) {
    case "pending":
      return uiStrings.pending;
    case "transcribing":
      return uiStrings.transcribing;
    case "translating":
      return uiStrings.translating;
    case "generating_audio":
      return uiStrings.generatingAudio;
    case "ready":
      return uiStrings.ready;
    case "error":
      return uiStrings.needsRetry;
    default:
      return "";
  }
}
