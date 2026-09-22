import { bufferToUint8Array } from "../lib/binary.js";
import type { SupportedTtsLanguage } from "../lib/languages.js";

export type TranscribeAudioInput = {
  audioBuffer: Buffer;
  filename: string;
  mimeType?: string;
  sourceLanguage?: SupportedTtsLanguage | null;
};

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
  return transcribeWithOpenAi(input);
}
