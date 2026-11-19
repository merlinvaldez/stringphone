import {
  CANONICAL_TTS_LANGUAGES,
  getSupportedTtsLanguage,
} from "./languages.js";
import { getCachedServerChatVoiceClone } from "./runChatVoiceCloning.js";
import { generateSpeech } from "../services/generateSpeech.js";
import type { OpenAiSpeechVoice } from "../services/generateOpenAiSpeech.js";

const MAX_OUTPUT_SPEECH_CHARACTERS = 500;
const CLONED_VOICE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export type RunOutputTextToSpeechInput = {
  text: unknown;
  language: unknown;
  speechVoice?: unknown;
  clonedVoiceId?: unknown;
  conversationId?: unknown;
  sourceLanguage?: unknown;
  pronunciationText?: unknown;
};

export type RunOutputTextToSpeechDeps = {
  generateSpeechImpl?: typeof generateSpeech;
};

export type RunOutputTextToSpeechResult =
  | {
      ok: true;
      audioBuffer: Buffer;
      contentType: "audio/wav";
      language: string;
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

export async function runOutputTextToSpeech(
  input: RunOutputTextToSpeechInput,
  deps: RunOutputTextToSpeechDeps = {},
): Promise<RunOutputTextToSpeechResult> {
  const text =
    typeof input.text === "string"
      ? input.text.trim().replace(/\s+/g, " ")
      : "";
  const supportedLanguage = getSupportedTtsLanguage(input.language);

  if (!text) {
    return {
      ok: false,
      status: 400,
      body: { error: "text is required" },
    };
  }

  if (text.length > MAX_OUTPUT_SPEECH_CHARACTERS) {
    return {
      ok: false,
      status: 400,
      body: {
        error: `text must be ${MAX_OUTPUT_SPEECH_CHARACTERS} characters or fewer`,
      },
    };
  }

  if (!supportedLanguage) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "language is not supported",
        supportedLanguages: CANONICAL_TTS_LANGUAGES,
      },
    };
  }

  if (
    input.speechVoice !== undefined &&
    input.speechVoice !== null &&
    input.speechVoice !== "marin" &&
    input.speechVoice !== "onyx"
  ) {
    return {
      ok: false,
      status: 400,
      body: { error: "speechVoice is not supported" },
    };
  }

  let resolvedClonedVoiceId: string | null = null;

  if (input.clonedVoiceId !== undefined && input.clonedVoiceId !== null && input.clonedVoiceId !== "") {
    if (
      typeof input.clonedVoiceId !== "string" ||
      !CLONED_VOICE_ID_PATTERN.test(input.clonedVoiceId.trim())
    ) {
      return {
        ok: false,
        status: 400,
        body: { error: "clonedVoiceId is not supported" },
      };
    }
    resolvedClonedVoiceId = input.clonedVoiceId.trim();
  } else if (
    typeof input.conversationId === "string" &&
    input.conversationId.trim()
  ) {
    const cached = getCachedServerChatVoiceClone(
      input.conversationId,
      input.sourceLanguage ?? supportedLanguage.code,
    );
    resolvedClonedVoiceId = cached?.voiceId ?? null;
  }

  const pronunciationText =
    typeof input.pronunciationText === "string" && input.pronunciationText.trim()
      ? input.pronunciationText.trim().slice(0, MAX_OUTPUT_SPEECH_CHARACTERS * 2)
      : undefined;
  const speechVoice = input.speechVoice as OpenAiSpeechVoice | undefined;
  const generateSpeechFn = deps.generateSpeechImpl ?? generateSpeech;
  const audioBuffer = await generateSpeechFn({
    text,
    targetLanguage: supportedLanguage,
    speechVoice,
    clonedVoiceId: resolvedClonedVoiceId,
    pronunciationText,
  });

  return {
    ok: true,
    audioBuffer,
    contentType: "audio/wav",
    language: supportedLanguage.name,
  };
}
