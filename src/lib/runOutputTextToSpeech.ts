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
  if (mimeType.includes("webm")) {
    return "webm";
  }

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

function inferStoredVoiceSampleFormat(audioBuffer: Buffer) {
  if (audioBuffer.length >= 12) {
    const header = audioBuffer.subarray(0, 12);
    const asciiHeader = header.toString("ascii");

    if (
      header[0] === 0x1a &&
      header[1] === 0x45 &&
      header[2] === 0xdf &&
      header[3] === 0xa3
    ) {
      return {
        filename: "saved-voice-reference.webm",
        mimeType: "audio/webm",
      };
    }

    if (asciiHeader.startsWith("OggS")) {
      return {
        filename: "saved-voice-reference.ogg",
        mimeType: "audio/ogg",
      };
    }

    if (asciiHeader.startsWith("RIFF") && asciiHeader.slice(8, 12) === "WAVE") {
      return {
        filename: "saved-voice-reference.wav",
        mimeType: "audio/wav",
      };
    }

    if (asciiHeader.slice(4, 8) === "ftyp") {
      return {
        filename: "saved-voice-reference.m4a",
        mimeType: "audio/mp4",
      };
    }

    if (
      asciiHeader.startsWith("ID3") ||
      (header[0] === 0xff && (header[1] & 0xe0) === 0xe0)
    ) {
      return {
        filename: "saved-voice-reference.mp3",
        mimeType: "audio/mpeg",
      };
    }
  }

  return {
    filename: "saved-voice-reference.mp3",
    mimeType: "audio/mpeg",
  };
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

  const audioBuffer = Buffer.from(trimmedAudioValue, "base64");
  const inferredFormat = inferStoredVoiceSampleFormat(audioBuffer);

  return {
    audioBuffer,
    originalFilename: inferredFormat.filename,
    mimeType: inferredFormat.mimeType,
  };
}

async function resolveSavedUserVoiceReference(input: {
  userId?: number | null;
}) {
  if (!Number.isInteger(input.userId) || !input.userId || input.userId < 1) {
    return null;
  }

  try {
    const savedVoiceSample = await getLatestUserVoiceSample({
      userId: input.userId,
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
