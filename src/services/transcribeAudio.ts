import { mistral } from "../lib/mistral.js";

export type TranscribeAudioInput = {
  audioBuffer: Buffer;
  filename: string;
};

export async function transcribeAudio(input: TranscribeAudioInput) {
  const transcription = await mistral.audio.transcriptions.complete({
    model: "voxtral-mini-latest",
    file: {
      fileName: input.filename,
      content: input.audioBuffer,
    },
  });
  return transcription.text;
}
