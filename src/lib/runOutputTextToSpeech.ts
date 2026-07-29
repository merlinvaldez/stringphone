import {
  CANONICAL_TTS_LANGUAGES,
  getSupportedTtsLanguage,
} from "./languages.js";
import { generateSpeech } from "../services/generateSpeech.js";
import { resolveOutputSpeechVoiceId } from "../services/resolveOutputSpeechVoiceId.js";
import { resolveSavedUserVoiceReference } from "../services/resolveSavedUserVoiceReference.js";

const MAX_OUTPUT_SPEECH_CHARACTERS = 500;

export type RunOutputTextToSpeechInput = {
  text: unknown;
  language: unknown;
  conversationId?: unknown;
  userId?: number | null;
};

export type RunOutputTextToSpeechResult =
  | {
      ok: true;
      audioBuffer: Buffer;
      contentType: "audio/mpeg";
      language: string;
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

export async function runOutputTextToSpeech(
  input: RunOutputTextToSpeechInput,
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

  const voiceSample = await resolveSavedUserVoiceReference({
    userId: input.userId,
    targetLanguage: supportedLanguage,
  });
  const voiceIdOverride = voiceSample
    ? null
    : await resolveOutputSpeechVoiceId(supportedLanguage);
  const audioBuffer = await generateSpeech({
    text,
    targetLanguage: supportedLanguage,
    voiceSample,
    voiceIdOverride,
  });

  return {
    ok: true,
    audioBuffer,
    contentType: "audio/mpeg",
    language: supportedLanguage.name,
  };
}
