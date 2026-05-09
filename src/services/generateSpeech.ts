import { mistral } from "../lib/mistral.js";
import type { SupportedTtsLanguage } from "../lib/languages.js";
import { generateCartesiaSpeech } from "./generateCartesiaSpeech.js";
import type { PreparedVoiceReference } from "./prepareVoiceReference.js";

export type GenerateSpeechInput = {
  text: string;
  targetLanguage: SupportedTtsLanguage;
  voiceSample: PreparedVoiceReference;
};

export async function generateSpeech(input: GenerateSpeechInput) {
  if (input.targetLanguage.provider === "cartesia") {
    return generateCartesiaSpeech(input);
  }

  const response = await mistral.audio.speech.complete({
    model: "voxtral-mini-tts-2603",
    input: input.text,
    refAudio: input.voiceSample.buffer.toString("base64"),
    responseFormat: "mp3",
  });
  return Buffer.from(response.audioData, "base64");
}
