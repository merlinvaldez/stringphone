import {
  ELEVENLABS_API_BASE_URL,
  ELEVENLABS_STT_MODEL_ID,
  getElevenLabsHeaders,
} from "../lib/elevenlabs.js";
import { bufferToUint8Array } from "../lib/binary.js";
import type { SupportedTtsLanguage } from "../lib/languages.js";

export type TranscribeAudioInput = {
  audioBuffer: Buffer;
  filename: string;
  mimeType?: string;
  sourceLanguage?: SupportedTtsLanguage | null;
  forceProvider?: "elevenlabs" | "openai";
};

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
    new Blob([bufferToUint8Array(input.audioBuffer)], {
      type: getTranscriptionMimeType(input),
    }),
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

async function transcribeWithOpenAi(input: TranscribeAudioInput) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OpenAI is not configured.");
  }

  const formData = new FormData();
  const model = process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-transcribe";

  formData.append(
    "file",
    new Blob([bufferToUint8Array(input.audioBuffer)], {
      type: getTranscriptionMimeType(input),
    }),
    input.filename,
  );
  formData.append("model", model);

  if (input.sourceLanguage?.code) {
    formData.append("languages[]", input.sourceLanguage.code);
  }

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  const body = (await response.json().catch(() => null)) as {
    text?: unknown;
    error?: { message?: unknown };
  } | null;

  if (!response.ok) {
    throw new Error(
      typeof body?.error?.message === "string"
        ? body.error.message
        : "OpenAI transcription failed.",
    );
  }

  if (typeof body?.text !== "string" || !body.text.trim()) {
    throw new Error("OpenAI transcription response did not contain text.");
  }

  return body.text.trim();
}

export async function transcribeAudio(input: TranscribeAudioInput) {
  if (input.forceProvider === "elevenlabs") {
    return transcribeWithElevenLabs(input);
  }

  if (input.forceProvider === "openai") {
    return transcribeWithOpenAi(input);
  }

  return transcribeWithOpenAi(input);
}
