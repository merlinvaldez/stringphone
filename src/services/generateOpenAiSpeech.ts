import { getOpenAiApiKey } from "../lib/openai.js";

type GenerateOpenAiSpeechInput = {
  text: string;
  language: string;
  voice?: OpenAiSpeechVoice;
};

export type OpenAiSpeechVoice = "marin" | "onyx";

type OpenAiErrorBody = {
  error?: {
    message?: unknown;
  };
};

export async function generateOpenAiSpeech(
  input: GenerateOpenAiSpeechInput,
) {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL?.trim() || "gpt-4o-mini-tts",
      voice:
        input.voice ?? (process.env.OPENAI_TTS_VOICE?.trim() || "marin"),
      input: input.text,
      response_format: "wav",
      instructions: `Speak the ${input.language} text exactly as written in a clear, natural conversational voice. Do not translate or paraphrase it.`,
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | OpenAiErrorBody
      | null;
    const message =
      typeof body?.error?.message === "string"
        ? body.error.message
        : "OpenAI speech generation failed.";

    throw new Error(message);
  }

  return Buffer.from(await response.arrayBuffer());
}
