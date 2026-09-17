import {
  CANONICAL_TTS_LANGUAGES,
  getSupportedTtsLanguage,
} from "./languages.js";
import { classifyLiveSegmentLanguage } from "../services/classifyLiveSegmentLanguage.js";
import { translateLiveDraft } from "../services/translateLiveDraft.js";

type ChatLanguagePayload = {
  code: string;
  label: string;
};

type LiveTranslationMode =
  | "realtime-translation"
  | "fallback-transcription";

export type RunLiveConversationTranslationResult =
  | {
      ok: true;
      utteranceId: string;
      revision: number;
      detectedSourceLanguage: ChatLanguagePayload & {
        confidence: number;
        ambiguous: boolean;
      };
      sourceLanguage: ChatLanguagePayload;
      targetLanguage: ChatLanguagePayload;
      sender: "self" | "partner";
      transcript: string;
      translatedText: string;
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizePositiveRevision(value: unknown) {
  const revision =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : 0;

  return Number.isInteger(revision) && revision > 0 ? revision : 0;
}

export async function runLiveConversationTranslation(input: {
  utteranceId: unknown;
  revision: unknown;
  sourceLanguage: unknown;
  targetLanguage: unknown;
  transcript: unknown;
  translatedText?: unknown;
  liveMode?: unknown;
}): Promise<RunLiveConversationTranslationResult> {
  const utteranceId = normalizeOptionalText(input.utteranceId);
  const revision = normalizePositiveRevision(input.revision);
  const myLanguage = getSupportedTtsLanguage(input.sourceLanguage);
  const theirLanguage = getSupportedTtsLanguage(input.targetLanguage);
  const transcript = normalizeOptionalText(input.transcript);
  const translatedTextOverride = normalizeOptionalText(input.translatedText);
  const liveMode: LiveTranslationMode =
    input.liveMode === "realtime-translation"
      ? "realtime-translation"
      : "fallback-transcription";

  if (!utteranceId) {
    return {
      ok: false,
      status: 400,
      body: { error: "utteranceId is required" },
    };
  }

  if (!revision) {
    return {
      ok: false,
      status: 400,
      body: { error: "revision must be a positive integer" },
    };
  }

  if (!myLanguage) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "sourceLanguage is not supported",
        supportedLanguages: CANONICAL_TTS_LANGUAGES,
      },
    };
  }

  if (!theirLanguage) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "targetLanguage is not supported",
        supportedLanguages: CANONICAL_TTS_LANGUAGES,
      },
    };
  }

  if (!transcript) {
    return {
      ok: false,
      status: 422,
      body: { error: "No speech was detected" },
    };
  }

  if (liveMode === "realtime-translation" && !translatedTextOverride) {
    return {
      ok: false,
      status: 422,
      body: { error: "No live translated speech was produced" },
    };
  }

  if (liveMode === "realtime-translation") {
    return {
      ok: true,
      utteranceId,
      revision,
      detectedSourceLanguage: {
        code: myLanguage.code,
        label: myLanguage.name,
        confidence: 1,
        ambiguous: false,
      },
      sourceLanguage: { code: myLanguage.code, label: myLanguage.name },
      targetLanguage: { code: theirLanguage.code, label: theirLanguage.name },
      sender: "self",
      transcript,
      translatedText: translatedTextOverride,
    };
  }

  const classification = await classifyLiveSegmentLanguage({
    transcript,
    myLanguageCode: myLanguage.code,
    myLanguage: myLanguage.name,
    theirLanguageCode: theirLanguage.code,
    theirLanguage: theirLanguage.name,
  });
  const detectedIsTheirLanguage =
    classification.languageCode === theirLanguage.code;
  const spokenLanguage = detectedIsTheirLanguage ? theirLanguage : myLanguage;
  const translationLanguage = detectedIsTheirLanguage ? myLanguage : theirLanguage;
  const sender = detectedIsTheirLanguage ? "partner" : "self";
  const translatedText = await translateLiveDraft({
    text: transcript,
    sourceLanguage: spokenLanguage.name,
    targetLanguage: translationLanguage.name,
  });

  return {
    ok: true,
    utteranceId,
    revision,
    detectedSourceLanguage: {
      code: spokenLanguage.code,
      label: spokenLanguage.name,
      confidence: classification.confidence,
      ambiguous:
        classification.confidence > 0 && classification.confidence < 0.55,
    },
    sourceLanguage: { code: spokenLanguage.code, label: spokenLanguage.name },
    targetLanguage: {
      code: translationLanguage.code,
      label: translationLanguage.name,
    },
    sender,
    transcript,
    translatedText,
  };
}
