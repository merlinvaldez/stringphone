import { randomUUID } from "node:crypto";
import type { createMessage, getConversation } from "../db/queries/conversations.js";
import {
  CANONICAL_TTS_LANGUAGES,
  getSupportedTtsLanguage,
  requiresPhoneticGuide,
} from "./languages.js";
import { createOpenAiResponse } from "./openai.js";
import { generatePronunciationGuidance } from "../services/generatePronunciationGuidance.js";
import type { refreshConversationTitle } from "../services/refreshConversationTitle.js";
import {
  sanitizeContextBias,
  transcribeWithVoxtral,
  type TranscribeVoxtralInput,
  type TranscribeVoxtralResult,
} from "../services/transcribeVoxtral.js";

export const MAX_LIVE_LISTEN_AUDIO_BYTES = 3_000_000;

const ISO_639_3_TO_1: Record<string, string> = {
  ara: "ar",
  ben: "bn",
  bul: "bg",
  ces: "cs",
  cze: "cs",
  dan: "da",
  deu: "de",
  ger: "de",
  ell: "el",
  gre: "el",
  eng: "en",
  fas: "fa",
  per: "fa",
  fin: "fi",
  fra: "fr",
  fre: "fr",
  guj: "gu",
  heb: "he",
  hin: "hi",
  hrv: "hr",
  hun: "hu",
  ind: "id",
  ita: "it",
  jpn: "ja",
  kan: "kn",
  kat: "ka",
  geo: "ka",
  kor: "ko",
  mal: "ml",
  mar: "mr",
  msa: "ms",
  may: "ms",
  nld: "nl",
  dut: "nl",
  nor: "no",
  nob: "no",
  pan: "pa",
  pol: "pl",
  por: "pt",
  ron: "ro",
  rum: "ro",
  rus: "ru",
  slk: "sk",
  slo: "sk",
  spa: "es",
  swe: "sv",
  tam: "ta",
  tel: "te",
  tgl: "tl",
  fil: "tl",
  tha: "th",
  tur: "tr",
  ukr: "uk",
  vie: "vi",
  zho: "zh",
  chi: "zh",
};

type UploadedAudioFile = {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
};

export type LiveListenSegmentResult = {
  segmentId: string;
  speakerId: string;
  sender: "self" | "partner";
  detectedLanguage: {
    code: string;
    label: string;
    isSupportedTts: boolean;
  };
  sourceLanguage: {
    code: string;
    label: string;
  };
  targetLanguage: {
    code: string;
    label: string;
  };
  transcript: string;
  translatedText: string;
  originalPronunciation: string;
  translatedPronunciation: string;
  startSecond: number;
  endSecond: number;
  needsPlayback: boolean;
  singleSpeakerAudioEligible: boolean;
  savedMessage: {
    id: string;
  } | null;
};

export type RunLiveListenChunkInput = {
  listenerLanguage: unknown;
  theirLanguage?: unknown;
  chunkId?: unknown;
  isPreview?: unknown;
  contextBias?: unknown;
  conversationId?: unknown;
  userId?: number | null;
  sourceAudioFile?: UploadedAudioFile;
};

export type RunLiveListenChunkResult =
  | {
      ok: true;
      chunkId: string;
      isPreview: boolean;
      listenerLanguage: {
        code: string;
        label: string;
      };
      segments: LiveListenSegmentResult[];
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

export type RunLiveListenChunkDeps = {
  transcribeWithVoxtralImpl?: (
    input: TranscribeVoxtralInput,
  ) => Promise<TranscribeVoxtralResult>;
  createOpenAiResponseImpl?: typeof createOpenAiResponse;
  generatePronunciationGuidanceImpl?: typeof generatePronunciationGuidance;
  getConversationImpl?: typeof getConversation;
  createMessageImpl?: typeof createMessage;
  refreshConversationTitleImpl?: typeof refreshConversationTitle;
};

function normalizeOptionalText(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function parseContextBias(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return sanitizeContextBias(raw.map((item) => String(item ?? "")));
  }

  if (typeof raw !== "string" || !raw.trim()) {
    return [];
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return sanitizeContextBias(parsed.map((item) => String(item ?? "")));
      }
    } catch {
      // Fall back to comma-separated parsing.
    }
  }

  return sanitizeContextBias(trimmed.split(","));
}

function resolveLanguageMetadata(
  rawCodeOrName: unknown,
  fallbackName?: unknown,
): { code: string; label: string; isSupportedTts: boolean } {
  const tryLookup = (candidate: unknown) => {
    if (typeof candidate !== "string" || !candidate.trim()) {
      return null;
    }

    const direct = getSupportedTtsLanguage(candidate);
    if (direct) {
      return direct;
    }

    const lower = candidate.trim().toLowerCase();
    const subtag = lower.split(/[-_]/)[0];
    if (subtag && subtag !== lower) {
      const bySubtag = getSupportedTtsLanguage(subtag);
      if (bySubtag) {
        return bySubtag;
      }
    }

    const mapped = ISO_639_3_TO_1[lower] ?? ISO_639_3_TO_1[subtag ?? ""];
    if (mapped) {
      return getSupportedTtsLanguage(mapped);
    }

    return null;
  };

  const supported = tryLookup(rawCodeOrName) ?? tryLookup(fallbackName);
  if (supported) {
    return {
      code: supported.code,
      label: supported.name,
      isSupportedTts: true,
    };
  }

  const rawCode = normalizeOptionalText(rawCodeOrName).toLowerCase();
  const baseCode = rawCode.split(/[-_]/)[0] || rawCode;
  const code = (ISO_639_3_TO_1[baseCode] ?? baseCode) || "und";
  const label =
    normalizeOptionalText(fallbackName) ||
    (code !== "und" ? code.toUpperCase() : "Unknown");

  return {
    code,
    label,
    isSupportedTts: false,
  };
}

function parseOpenAiLiveSegmentResponse(rawText: string): {
  detectedLanguageCode?: string;
  detectedLanguageName?: string;
  isListenerLanguage?: boolean;
  translatedText?: string;
} | null {
  const candidates = [rawText.trim()];
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch && jsonMatch[0] !== candidates[0]) {
    candidates.push(jsonMatch[0]);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown> | null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return {
          detectedLanguageCode:
            typeof parsed.detectedLanguageCode === "string"
              ? parsed.detectedLanguageCode
              : undefined,
          detectedLanguageName:
            typeof parsed.detectedLanguageName === "string"
              ? parsed.detectedLanguageName
              : undefined,
          isListenerLanguage:
            typeof parsed.isListenerLanguage === "boolean"
              ? parsed.isListenerLanguage
              : undefined,
          translatedText:
            typeof parsed.translatedText === "string"
              ? parsed.translatedText
              : undefined,
        };
      }
    } catch {
      // Try extracted JSON block if available.
    }
  }

  return null;
}

export async function runLiveListenChunk(
  input: RunLiveListenChunkInput,
  deps: RunLiveListenChunkDeps = {},
): Promise<RunLiveListenChunkResult> {
  const listenerLanguage = getSupportedTtsLanguage(input.listenerLanguage);
  if (!listenerLanguage) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "listenerLanguage is not supported",
        supportedLanguages: CANONICAL_TTS_LANGUAGES,
      },
    };
  }

  const conversationId = normalizeOptionalText(input.conversationId);
  if (conversationId) {
    if (!Number.isInteger(input.userId) || !input.userId || input.userId < 1) {
      return {
        ok: false,
        status: 401,
        body: { error: "Unauthorized" },
      };
    }

    const getConversationFn =
      deps.getConversationImpl ??
      (await import("../db/queries/conversations.js")).getConversation;
    const conversation = await getConversationFn(conversationId, input.userId);
    if (!conversation) {
      return {
        ok: false,
        status: 404,
        body: { error: "Conversation not found or unauthorized" },
      };
    }
  }

  if (
    !input.sourceAudioFile ||
    !Buffer.isBuffer(input.sourceAudioFile.buffer) ||
    input.sourceAudioFile.buffer.length === 0
  ) {
    return {
      ok: false,
      status: 400,
      body: { error: "sourceAudio file is required" },
    };
  }

  if (input.sourceAudioFile.buffer.length > MAX_LIVE_LISTEN_AUDIO_BYTES) {
    return {
      ok: false,
      status: 400,
      body: { error: "sourceAudio file exceeds 3 MB limit" },
    };
  }

  const isPreview = input.isPreview === true || input.isPreview === "true";
  const chunkId = normalizeOptionalText(input.chunkId) || randomUUID();
  const theirLanguageHint = getSupportedTtsLanguage(input.theirLanguage);
  const contextBias = parseContextBias(input.contextBias);

  const transcribeWithVoxtralFn =
    deps.transcribeWithVoxtralImpl ?? transcribeWithVoxtral;
  let transcription: TranscribeVoxtralResult;

  try {
    transcription = await transcribeWithVoxtralFn({
      audioBuffer: input.sourceAudioFile.buffer,
      filename: input.sourceAudioFile.filename || "live-listen.webm",
      mimeType: input.sourceAudioFile.mimeType,
      contextBias,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/no speech|empty|did not contain text/i.test(message)) {
      return {
        ok: false,
        status: 422,
        body: { error: "No speech was detected" },
      };
    }
    throw error;
  }

  if (!transcription.segments.length) {
    return {
      ok: false,
      status: 422,
      body: { error: "No speech was detected" },
    };
  }

  const singleSpeakerAudioEligible =
    !isPreview && transcription.distinctSpeakerCount === 1;
  const shouldPersistToPostgres =
    !isPreview &&
    Boolean(conversationId) &&
    Number.isInteger(input.userId) &&
    Boolean(input.userId);
  const createOpenAiResponseFn =
    deps.createOpenAiResponseImpl ?? createOpenAiResponse;
  const generatePronunciationFn =
    deps.generatePronunciationGuidanceImpl ?? generatePronunciationGuidance;
  const createMessageFn = shouldPersistToPostgres
    ? (deps.createMessageImpl ??
      (await import("../db/queries/conversations.js")).createMessage)
    : null;
  const refreshTitleFn = shouldPersistToPostgres
    ? (deps.refreshConversationTitleImpl ??
      (await import("../services/refreshConversationTitle.js")).refreshConversationTitle)
    : null;

  const segments: LiveListenSegmentResult[] = [];
  let persistedAnyMessage = false;

  for (let index = 0; index < transcription.segments.length; index += 1) {
    const rawSegment = transcription.segments[index];
    const segmentId = `${chunkId}_seg_${index}`;
    const initialLangHint = resolveLanguageMetadata(
      rawSegment.languageCode || transcription.detectedLanguage,
    );

    let detectedLanguage = initialLangHint;
    let isListenerLang = false;
    let translatedText = "";

    // Fast path: when a single-speaker chunk is already confidently transcribed
    // in the listener's language, skip direct OpenAI translation to avoid latency.
    if (
      transcription.distinctSpeakerCount === 1 &&
      initialLangHint.code &&
      initialLangHint.code === listenerLanguage.code
    ) {
      isListenerLang = true;
      detectedLanguage = {
        code: listenerLanguage.code,
        label: listenerLanguage.name,
        isSupportedTts: true,
      };
    } else {
      const runtimeEnv = typeof process !== "undefined" ? process.env : undefined;
      const openAiModel =
        runtimeEnv?.OPENAI_LIVE_TRANSLATION_MODEL?.trim() ||
        runtimeEnv?.OPENAI_TRANSLATION_MODEL?.trim() ||
        "gpt-4o-mini";

      const rawOpenAiOutput = await createOpenAiResponseFn({
        model: openAiModel,
        jsonObject: true,
        instructions: [
          "You inspect live spoken utterance segments for a multilingual conversation listener.",
          "Determine the actual language spoken in the segment (it may be ANY language, not only the hint).",
          "Return a JSON object with exact keys: detectedLanguageCode (ISO 639-1 lowercase code when known), detectedLanguageName (English language name), isListenerLanguage (boolean: true ONLY if spoken in the listener language), translatedText (natural translation into the listener language, or empty string \"\" if isListenerLanguage is true).",
          "Preserve meaning cleanly without commentary or quotes.",
        ].join(" "),
        input: [
          `Listener language: ${listenerLanguage.name} (${listenerLanguage.code})`,
          theirLanguageHint
            ? `Optional conversation partner language hint (only for very short/ambiguous utterances): ${theirLanguageHint.name} (${theirLanguageHint.code})`
            : "",
          initialLangHint.code && initialLangHint.code !== "und"
            ? `ASR detected language hint: ${initialLangHint.label} (${initialLangHint.code})`
            : "",
          `Spoken transcript:\n${rawSegment.text}`,
        ]
          .filter(Boolean)
          .join("\n"),
      });

      const parsed = parseOpenAiLiveSegmentResponse(rawOpenAiOutput);
      if (!parsed) {
        console.error("Live listen translation parse failed");
      }

      detectedLanguage = resolveLanguageMetadata(
        parsed?.detectedLanguageCode ?? initialLangHint.code,
        parsed?.detectedLanguageName ?? initialLangHint.label,
      );
      isListenerLang =
        parsed?.isListenerLanguage === true ||
        detectedLanguage.code === listenerLanguage.code;

      if (isListenerLang) {
        translatedText = "";
        detectedLanguage = {
          code: listenerLanguage.code,
          label: listenerLanguage.name,
          isSupportedTts: true,
        };
      } else {
        translatedText =
          typeof parsed?.translatedText === "string"
            ? parsed.translatedText.trim()
            : rawOpenAiOutput.trim();
      }
    }

    const sender: "self" | "partner" = isListenerLang ? "self" : "partner";
    const sourceLanguage = {
      code: detectedLanguage.code,
      label: detectedLanguage.label,
    };
    const targetLanguage = {
      code: listenerLanguage.code,
      label: listenerLanguage.name,
    };
    const needsPlayback = !isListenerLang && Boolean(translatedText.trim());

    let originalPronunciation = "";
    let translatedPronunciation = "";

    if (
      !isPreview &&
      !isListenerLang &&
      translatedText &&
      (requiresPhoneticGuide(sourceLanguage.code, listenerLanguage.code) ||
        requiresPhoneticGuide(listenerLanguage.code, sourceLanguage.code))
    ) {
      try {
        const guidance = await generatePronunciationFn({
          originalText: rawSegment.text,
          translatedText,
          sourceLanguageCode: sourceLanguage.code,
          sourceLanguage: sourceLanguage.label,
          targetLanguageCode: listenerLanguage.code,
          targetLanguage: listenerLanguage.name,
        });
        originalPronunciation = guidance.originalPronunciation;
        translatedPronunciation = guidance.translatedPronunciation;
      } catch {
        console.error("Live listen pronunciation guidance failed");
      }
    }

    let savedMessageId = "";
    if (shouldPersistToPostgres && createMessageFn) {
      try {
        const saved = await createMessageFn({
          conversationId,
          sender,
          messageOrigin: "human",
          originalText: rawSegment.text,
          originalPronunciation,
          translatedText: isListenerLang ? "" : translatedText,
          translatedPronunciation,
          transcript: rawSegment.text,
          audioUrl:
            singleSpeakerAudioEligible && index === 0
              ? `data:${input.sourceAudioFile.mimeType ?? "audio/webm"};base64,${input.sourceAudioFile.buffer.toString("base64")}`
              : null,
        });
        savedMessageId = typeof saved?.id === "string" ? saved.id : "";
        persistedAnyMessage = true;
      } catch {
        console.error("Failed to persist live listen segment");
      }
    }

    segments.push({
      segmentId,
      speakerId: rawSegment.speakerId,
      sender,
      detectedLanguage,
      sourceLanguage,
      targetLanguage,
      transcript: rawSegment.text,
      translatedText: isListenerLang ? "" : translatedText,
      originalPronunciation,
      translatedPronunciation,
      startSecond: rawSegment.startSecond,
      endSecond: rawSegment.endSecond,
      needsPlayback,
      singleSpeakerAudioEligible,
      savedMessage: savedMessageId ? { id: savedMessageId } : null,
    });
  }

  if (persistedAnyMessage && shouldPersistToPostgres && refreshTitleFn) {
    try {
      await refreshTitleFn({
        conversationId,
        userId: input.userId,
        sourceLanguageCode: listenerLanguage.code,
        targetLanguageCode:
          theirLanguageHint?.code ||
          segments.find((s) => s.sender === "partner")?.sourceLanguage.code ||
          listenerLanguage.code,
      });
    } catch {
      console.error("Failed to persist live listen segment");
    }
  }

  return {
    ok: true,
    chunkId,
    isPreview,
    listenerLanguage: {
      code: listenerLanguage.code,
      label: listenerLanguage.name,
    },
    segments,
  };
}
