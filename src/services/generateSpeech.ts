import { mistral } from "../lib/mistral.js";

export type GenerateSpeechInput = {
  text: string;
  voiceSampleBuffer: Buffer;
};

export async function generateSpeech(input: GenerateSpeechInput) {
  const response = await mistral.audio.speech.complete({
    model: "voxtral-mini-tts-2603",
    input: input.text,
    refAudio: input.voiceSampleBuffer.toString("base64"),
    responseFormat: "mp3",
  });
  return Buffer.from(response.audioData, "base64");
}
