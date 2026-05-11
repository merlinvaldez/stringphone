import { mistral } from "../lib/mistral.js";
import {
  ELEVENLABS_API_BASE_URL,
  ELEVENLABS_STT_MODEL_ID,
  getElevenLabsHeaders,
} from "../lib/elevenlabs.js";
import type { SupportedTtsLanguage } from "../lib/languages.js";

export type TranscribeAudioInput = {
  audioBuffer: Buffer;
  filename: string;
  mimeType?: string;
  sourceLanguage?: SupportedTtsLanguage | null;
};

const MISTRAL_TRANSCRIPTION_LANGUAGE_CODES = new Set([
  "en",
  "zh",
  "hi",
  "es",
  "ar",
  "fr",
  "pt",
  "ru",
  "de",
  "ja",
  "ko",
  "it",
  "nl",
]);

function getElevenLabsLanguageCode(input: TranscribeAudioInput) {
  if (input.sourceLanguage?.code === "fa") {
    return "fas";
  }

  return input.sourceLanguage?.code ?? null;
}

function getTranscriptionMimeType(input: TranscribeAudioInput) {
  const lowerName = input.filename.toLowerCase();
  const lowerMimeType = input.mimeType?.toLowerCase();

  if (lowerMimeType) {
    return lowerMimeType;
  }

  if (lowerName.endsWith(".mp3")) {
    return "audio/mpeg";
  }

  if (lowerName.endsWith(".wav")) {
    return "audio/wav";
  }

  if (lowerName.endsWith(".m4a")) {
    return "audio/m4a";
  }

  if (lowerName.endsWith(".ogg")) {
    return "audio/ogg";
  }

  return "audio/webm";
}

async function readElevenLabsError(response: Response, fallbackMessage: string) {
  try {
    const body = (await response.json()) as {
      detail?: {
        message?: string;
      };
      message?: string;
      error?: string;
    };
    const message = body.detail?.message ?? body.message ?? body.error;

    if (message) {
      return `${fallbackMessage}: ${message}`;
    }
  } catch {
    // Ignore JSON parse failures and fall back to plain text or status text.
  }

  try {
    const text = (await response.text()).trim();

    if (text) {
      return `${fallbackMessage}: ${text}`;
    }
  } catch {
    // Ignore text parse failures and fall back to the HTTP status.
  }

  return `${fallbackMessage}: ${response.status} ${response.statusText}`;
}

async function transcribeWithElevenLabs(input: TranscribeAudioInput) {
  const formData = new FormData();

  formData.append(
    "file",
    new Blob([input.audioBuffer], { type: getTranscriptionMimeType(input) }),
    input.filename,
  );
  formData.append("model_id", ELEVENLABS_STT_MODEL_ID);
  formData.append("tag_audio_events", "false");
  formData.append("timestamps_granularity", "none");
  formData.append("num_speakers", "1");
  formData.append("no_verbatim", "true");

  const languageCode = getElevenLabsLanguageCode(input);

  if (languageCode) {
    formData.append("language_code", languageCode);
  }

  const response = await fetch(`${ELEVENLABS_API_BASE_URL}/speech-to-text`, {
    method: "POST",
    headers: getElevenLabsHeaders(),
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      await readElevenLabsError(response, "ElevenLabs transcription failed"),
    );
  }

  const body = (await response.json()) as {
    text?: string;
  };

  if (typeof body.text !== "string" || !body.text.trim()) {
    throw new Error("ElevenLabs transcription response did not contain text.");
  }

  return body.text.trim();
}

async function transcribeWithMistral(input: TranscribeAudioInput) {
  const request: {
    model: string;
    file: {
      fileName: string;
      content: Buffer;
    };
    language?: string;
  } = {
    model: "voxtral-mini-latest",
    file: {
      fileName: input.filename,
      content: input.audioBuffer,
    },
  };

  if (
    input.sourceLanguage &&
    MISTRAL_TRANSCRIPTION_LANGUAGE_CODES.has(input.sourceLanguage.code)
  ) {
    request.language = input.sourceLanguage.code;
  }

  const transcription = await mistral.audio.transcriptions.complete(request);
  return transcription.text;
}

export async function transcribeAudio(input: TranscribeAudioInput) {
  if (input.sourceLanguage?.code === "fa") {
    return transcribeWithElevenLabs(input);
  }

  return transcribeWithMistral(input);
}
