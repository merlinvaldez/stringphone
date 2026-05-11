import { mistral } from "../lib/mistral.js";
import type { SupportedTtsLanguage } from "../lib/languages.js";
import { generateCartesiaSpeech } from "./generateCartesiaSpeech.js";
import { generateElevenLabsSpeech } from "./generateElevenLabsSpeech.js";
import type { PreparedVoiceReference } from "./prepareVoiceReference.js";

export type GenerateSpeechInput = {
  text: string;
  targetLanguage: SupportedTtsLanguage;
  voiceSample: PreparedVoiceReference;
  forceElevenLabsVoiceId?: string | null;
};

export async function generateSpeech(input: GenerateSpeechInput) {
  if (input.forceElevenLabsVoiceId) {
    return generateElevenLabsSpeech({
      ...input,
      voiceIdOverride: input.forceElevenLabsVoiceId,
    });
  }

  if (input.targetLanguage.provider === "cartesia") {
    return generateCartesiaSpeech(input);
  }

  if (input.targetLanguage.provider === "elevenlabs") {
    return generateElevenLabsSpeech(input);
  }

  const response = await mistral.audio.speech.complete({
    model: "voxtral-mini-tts-2603",
    input: input.text,
    refAudio: input.voiceSample.buffer.toString("base64"),
    responseFormat: "mp3",
  });
  return Buffer.from(response.audioData, "base64");
}
