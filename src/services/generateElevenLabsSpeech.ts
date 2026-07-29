import { randomUUID } from "node:crypto";
import {
  ELEVENLABS_API_BASE_URL,
  ELEVENLABS_TTS_MODEL_ID,
  ELEVENLABS_TTS_OUTPUT_FORMAT,
  getElevenLabsHeaders,
} from "../lib/elevenlabs.js";
import type { SupportedTtsLanguage } from "../lib/languages.js";
import type { PreparedVoiceReference } from "./prepareVoiceReference.js";

export type GenerateElevenLabsSpeechInput = {
  text: string;
  targetLanguage: SupportedTtsLanguage;
  voiceSample?: PreparedVoiceReference | null;
  voiceIdOverride?: string | null;
};

type ElevenLabsCloneVoiceResponse = {
  voice_id?: string;
};

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

async function cloneElevenLabsVoice(
  input: GenerateElevenLabsSpeechInput & { voiceSample: PreparedVoiceReference },
) {
  const formData = new FormData();

  formData.append("name", `stringphone-${input.targetLanguage.code}-${randomUUID()}`);
  formData.append(
    "description",
    `Ephemeral StringPhone voice clone for ${input.targetLanguage.name}`,
  );
  formData.append(
    "files",
    new Blob([input.voiceSample.buffer], { type: input.voiceSample.mimeType }),
    input.voiceSample.filename,
  );

  const response = await fetch(`${ELEVENLABS_API_BASE_URL}/voices/add`, {
    method: "POST",
    headers: getElevenLabsHeaders(),
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readElevenLabsError(response, "ElevenLabs voice clone failed"));
  }

  const body = (await response.json()) as ElevenLabsCloneVoiceResponse;

  if (!body.voice_id) {
    throw new Error("ElevenLabs voice clone did not return a voice id.");
  }

  return body.voice_id;
}

async function synthesizeElevenLabsSpeech(
  input: GenerateElevenLabsSpeechInput,
  voiceId: string,
) {
  const url = new URL(`${ELEVENLABS_API_BASE_URL}/text-to-speech/${voiceId}`);
  url.searchParams.set("output_format", ELEVENLABS_TTS_OUTPUT_FORMAT);

  const response = await fetch(url, {
    method: "POST",
    headers: getElevenLabsHeaders({
      Accept: "audio/mpeg",
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      text: input.text,
      model_id: ELEVENLABS_TTS_MODEL_ID,
      language_code: input.targetLanguage.code,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await readElevenLabsError(response, "ElevenLabs speech generation failed"),
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

async function deleteElevenLabsVoice(voiceId: string) {
  const response = await fetch(`${ELEVENLABS_API_BASE_URL}/voices/${voiceId}`, {
    method: "DELETE",
    headers: getElevenLabsHeaders(),
  });

  if (!response.ok && response.status !== 404) {
    console.warn(
      `Failed to delete ephemeral ElevenLabs voice ${voiceId}: ${response.status} ${response.statusText}`,
    );
  }
}

export async function generateElevenLabsSpeech(
  input: GenerateElevenLabsSpeechInput,
) {
  if (input.voiceIdOverride) {
    return synthesizeElevenLabsSpeech(input, input.voiceIdOverride);
  }

  const voiceSample = input.voiceSample;

  if (!voiceSample) {
    throw new Error("ElevenLabs speech generation requires a voice sample or voice id.");
  }

  let voiceId: string | null = null;

  try {
    voiceId = await cloneElevenLabsVoice({
      ...input,
      voiceSample,
    });
    return await synthesizeElevenLabsSpeech(input, voiceId);
  } finally {
    if (voiceId) {
      await deleteElevenLabsVoice(voiceId).catch((error) => {
        console.warn("Failed to clean up ElevenLabs voice", error);
      });
    }
  }
}
