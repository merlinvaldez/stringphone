import { CANONICAL_TTS_LANGUAGES, getSupportedTtsLanguage } from "./languages.js";
import { generateSpeech } from "../services/generateSpeech.js";
import {
  prepareVoiceReference,
  type PreparedVoiceReference,
} from "../services/prepareVoiceReference.js";
import { transcribeAudio } from "../services/transcribeAudio.js";
import { translateText } from "../services/translateText.js";

export type RunSpeechTranslationInput = {
  responseMode?: unknown;
  sourceLanguage?: unknown;
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
  preparedVoiceSample?: PreparedVoiceReference | null;
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
  const supportedSourceLanguage =
    input.sourceLanguage == null
      ? null
      : getSupportedTtsLanguage(input.sourceLanguage);
  const supportedTargetLanguage = getSupportedTtsLanguage(input.targetLanguage);

  if (input.sourceLanguage != null && !supportedSourceLanguage) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "sourceLanguage is not supported",
        supportedLanguages: CANONICAL_TTS_LANGUAGES,
      },
    };
  }

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

  if (!input.voiceSampleFile && !input.preparedVoiceSample) {
    return {
      ok: false,
      status: 400,
      body: { error: "voiceSample file is required" },
    };
  }

  if (supportedSourceLanguage?.code === "fa" || supportedTargetLanguage.code === "fa") {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Persian is text-only right now. Use Chat mode for Persian messages.",
      },
    };
  }

  const transcript = await transcribeAudio({
    audioBuffer: input.sourceAudioFile.buffer,
    filename: input.sourceAudioFile.filename,
    mimeType: input.sourceAudioFile.mimeType,
    sourceLanguage: supportedSourceLanguage,
  });

  const translation = await translateText({
    text: transcript,
    sourceLanguage: supportedSourceLanguage?.name,
    targetLanguage: supportedTargetLanguage.name,
  });

  const voiceReferenceBuffer =
    input.preparedVoiceSample ??
    await prepareVoiceReference({
      audioBuffer: input.voiceSampleFile!.buffer,
      originalFilename: input.voiceSampleFile!.filename,
      mimeType: input.voiceSampleFile!.mimeType,
    });

  const audioBuffer = await generateSpeech({
    text: translation,
    targetLanguage: supportedTargetLanguage,
    voiceSample: voiceReferenceBuffer,
    voiceIdOverride: null,
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
