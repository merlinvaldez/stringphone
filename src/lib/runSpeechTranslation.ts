import { CANONICAL_TTS_LANGUAGES, getSupportedTtsLanguage } from "./languages.js";
import { generateSpeech } from "../services/generateSpeech.js";
import { prepareVoiceReference } from "../services/prepareVoiceReference.js";
import { transcribeAudio } from "../services/transcribeAudio.js";
import { translateText } from "../services/translateText.js";

export type RunSpeechTranslationInput = {
  responseMode?: unknown;
  targetLanguage: unknown;
  sourceAudioFile?: {
    buffer: Buffer;
    filename: string;
    mimeType?: string;
  };
  voiceSampleFile?: {
    buffer: Buffer;
    filename: string;
    mimeType?: string;
  };
};

export type RunSpeechTranslationResult =
  | {
      ok: true;
      wantsJson: boolean;
      transcript: string;
      translation: string;
      targetLanguage: string;
      audioBuffer: Buffer;
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

export async function runSpeechTranslation(
  input: RunSpeechTranslationInput,
): Promise<RunSpeechTranslationResult> {
  const wantsJson =
    typeof input.responseMode === "string" &&
    input.responseMode.trim().toLowerCase() === "json";
  const supportedTargetLanguage = getSupportedTtsLanguage(input.targetLanguage);

  if (typeof input.targetLanguage !== "string" || !input.targetLanguage.trim()) {
    return {
      ok: false,
      status: 400,
      body: { error: "targetLanguage is required" },
    };
  }

  if (!supportedTargetLanguage) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "targetLanguage is not supported",
        supportedLanguages: CANONICAL_TTS_LANGUAGES,
      },
    };
  }

  if (!input.sourceAudioFile) {
    return {
      ok: false,
      status: 400,
      body: { error: "sourceAudio file is required" },
    };
  }

  if (!input.voiceSampleFile) {
    return {
      ok: false,
      status: 400,
      body: { error: "voiceSample file is required" },
    };
  }

  const transcript = await transcribeAudio({
    audioBuffer: input.sourceAudioFile.buffer,
    filename: input.sourceAudioFile.filename,
  });

  const translation = await translateText({
    text: transcript,
    targetLanguage: supportedTargetLanguage.name,
  });

  const voiceReferenceBuffer = await prepareVoiceReference({
    audioBuffer: input.voiceSampleFile.buffer,
    originalFilename: input.voiceSampleFile.filename,
    mimeType: input.voiceSampleFile.mimeType,
  });

  const audioBuffer = await generateSpeech({
    text: translation,
    targetLanguage: supportedTargetLanguage,
    voiceSample: voiceReferenceBuffer,
  });

  return {
    ok: true,
    wantsJson,
    transcript,
    translation,
    targetLanguage: supportedTargetLanguage.name,
    audioBuffer,
  };
}
