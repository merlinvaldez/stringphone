import { mistral } from "../lib/mistral.js";

export type CloneVoiceInput = {
  name: string;
  sampleAudioBuffer: Buffer;
  sampleFilename: string;
};

export async function cloneVoice(input: CloneVoiceInput) {
  const sampleAudio = input.sampleAudioBuffer.toString("base64");

  return mistral.audio.voices.create({
    name: input.name,
    sampleAudio,
    sampleFilename: input.sampleFilename,
  });
}
