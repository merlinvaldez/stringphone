import {
  CANONICAL_TTS_LANGUAGES,
  getSupportedTtsLanguage,
} from "./languages.js";
import { generateSpeech } from "../services/generateSpeech.js";
import type { OpenAiSpeechVoice } from "../services/generateOpenAiSpeech.js";

const MAX_OUTPUT_SPEECH_CHARACTERS = 500;

export type RunOutputTextToSpeechInput = {
  text: unknown;
  language: unknown;
  speechVoice?: unknown;
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

  const speechVoice = input.speechVoice as OpenAiSpeechVoice | undefined;
  const audioBuffer = await generateSpeech({
    text,
    targetLanguage: supportedLanguage,
    speechVoice,
  });

  return {
    ok: true,
    audioBuffer,
    contentType: "audio/wav",
    language: supportedLanguage.name,
  };
}
