import { randomUUID } from "node:crypto";
import {
  CARTESIA_API_BASE_URL,
  CARTESIA_TTS_MODEL_ID,
  getCartesiaHeaders,
} from "../lib/cartesia.js";
import type { SupportedTtsLanguage } from "../lib/languages.js";
import type { PreparedVoiceReference } from "./prepareVoiceReference.js";

export type GenerateCartesiaSpeechInput = {
  text: string;
  targetLanguage: SupportedTtsLanguage;
  voiceSample?: PreparedVoiceReference | null;
  voiceIdOverride?: string | null;
};

type CartesiaCloneVoiceResponse = {
  id?: string;
};

async function readCartesiaError(response: Response, fallbackMessage: string) {
  try {
    const body = (await response.json()) as {
      title?: string;
      message?: string;
      error?: string;
    };
    const message = body.message ?? body.error ?? body.title;

    if (message) {
      return `${fallbackMessage}: ${message}`;
    }
  } catch {
    // Ignore JSON parse failures and fall back to status text.
  }

  return `${fallbackMessage}: ${response.status} ${response.statusText}`;
}

async function cloneCartesiaVoice(
  input: GenerateCartesiaSpeechInput & { voiceSample: PreparedVoiceReference },
) {
  const formData = new FormData();

  formData.append(
    "clip",
    new Blob([input.voiceSample.buffer], { type: input.voiceSample.mimeType }),
    input.voiceSample.filename,
  );
  formData.append("name", `stringphone-${input.targetLanguage.code}-${randomUUID()}`);
  formData.append(
    "description",
    `Ephemeral StringPhone voice clone for ${input.targetLanguage.name}`,
  );
  formData.append("language", input.targetLanguage.code);
  formData.append("enhance", "false");

  const response = await fetch(`${CARTESIA_API_BASE_URL}/voices/clone`, {
    method: "POST",
    headers: getCartesiaHeaders(),
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readCartesiaError(response, "Cartesia voice clone failed"));
  }

  const body = (await response.json()) as CartesiaCloneVoiceResponse;

  if (!body.id) {
    throw new Error("Cartesia voice clone did not return a voice id.");
  }

  return body.id;
}

async function synthesizeCartesiaSpeech(
  input: GenerateCartesiaSpeechInput,
  voiceId: string,
) {
  const response = await fetch(`${CARTESIA_API_BASE_URL}/tts/bytes`, {
    method: "POST",
    headers: getCartesiaHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      model_id: CARTESIA_TTS_MODEL_ID,
      transcript: input.text,
      voice: {
        mode: "id",
        id: voiceId,
      },
      language: input.targetLanguage.code,
      output_format: {
        container: "mp3",
        sample_rate: 44100,
        bit_rate: 128000,
      },
      save: false,
    }),
  });

  if (!response.ok) {
    throw new Error(await readCartesiaError(response, "Cartesia speech generation failed"));
  }

  return Buffer.from(await response.arrayBuffer());
}

async function deleteCartesiaVoice(voiceId: string) {
  const response = await fetch(`${CARTESIA_API_BASE_URL}/voices/${voiceId}`, {
    method: "DELETE",
    headers: getCartesiaHeaders(),
  });

  if (!response.ok && response.status !== 404) {
    console.warn(
      `Failed to delete ephemeral Cartesia voice ${voiceId}: ${response.status} ${response.statusText}`,
    );
  }
}

export async function generateCartesiaSpeech(input: GenerateCartesiaSpeechInput) {
  if (input.voiceIdOverride) {
    return synthesizeCartesiaSpeech(input, input.voiceIdOverride);
  }

  const voiceSample = input.voiceSample;

  if (!voiceSample) {
    throw new Error("Cartesia speech generation requires a voice sample or voice id.");
  }

  let voiceId: string | null = null;

  try {
    voiceId = await cloneCartesiaVoice({
      ...input,
      voiceSample,
    });
    return await synthesizeCartesiaSpeech(input, voiceId);
  } finally {
    if (voiceId) {
      await deleteCartesiaVoice(voiceId).catch((error) => {
        console.warn("Failed to clean up Cartesia voice", error);
      });
    }
  }
}
