import {
  CANONICAL_TTS_LANGUAGES,
  getSupportedTtsLanguage,
} from "./languages.js";
import { getLatestUserVoiceSample } from "../db/queries/voiceSamples.js";
import { generateSpeech } from "../services/generateSpeech.js";
import { prepareVoiceReference } from "../services/prepareVoiceReference.js";
import { resolveOutputSpeechVoiceId } from "../services/resolveOutputSpeechVoiceId.js";

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
    conversationId: input.conversationId,
    targetLanguageCode: supportedLanguage.code,
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

function getFilenameExtension(mimeType: string) {
  if (mimeType.includes("wav")) {
    return "wav";
  }

  if (mimeType.includes("mp3") || mimeType.includes("mpeg")) {
    return "mp3";
  }

  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  return "bin";
}

function decodeStoredVoiceSample(audioValue: string) {
  const trimmedAudioValue = audioValue.trim();

  if (!trimmedAudioValue) {
    return null;
  }

  if (trimmedAudioValue.startsWith("data:")) {
    const match = trimmedAudioValue.match(/^data:([^;]+);base64,(.+)$/i);

    if (!match) {
      return null;
    }

    const mimeType = match[1] || "audio/mpeg";

    return {
      audioBuffer: Buffer.from(match[2], "base64"),
      originalFilename: `saved-voice-reference.${getFilenameExtension(mimeType)}`,
      mimeType,
    };
  }

  return {
    audioBuffer: Buffer.from(trimmedAudioValue, "base64"),
    originalFilename: "saved-voice-reference.mp3",
    mimeType: "audio/mpeg",
  };
}

async function resolveSavedUserVoiceReference(input: {
  userId?: number | null;
  conversationId?: unknown;
  targetLanguageCode: string;
}) {
  if (!Number.isInteger(input.userId) || !input.userId || input.userId < 1) {
    return null;
  }

  const preferredConversationId =
    typeof input.conversationId === "string" && input.conversationId.trim()
      ? input.conversationId.trim()
      : null;

  try {
    const savedVoiceSample = await getLatestUserVoiceSample({
      userId: input.userId,
      preferredConversationId,
      targetLanguage: input.targetLanguageCode,
    });

    if (!savedVoiceSample?.audio_url) {
      return null;
    }

    const decodedVoiceSample = decodeStoredVoiceSample(savedVoiceSample.audio_url);

    if (!decodedVoiceSample) {
      return null;
    }

    return prepareVoiceReference(decodedVoiceSample);
  } catch (error) {
    console.warn("Failed to load saved user voice sample for output speech", error);
    return null;
  }
}
