import {
  CANONICAL_TTS_LANGUAGES,
  getSupportedTtsLanguage,
  requiresPhoneticGuide,
} from "./languages.js";
import { runSpeechTranslation } from "./runSpeechTranslation.js";
import { generatePronunciationGuidance } from "../services/generatePronunciationGuidance.js";

type ChatLanguagePayload = {
  code: string;
  label: string;
};

export type RunVoiceChatMessageInput = {
  sourceLanguage: unknown;
  targetLanguage: unknown;
  sourceAudioFile?: {
    buffer: Buffer;
    filename: string;
    mimeType?: string;
  };
};

export type RunVoiceChatMessageResult =
  | {
      ok: true;
      transcript: string;
      translatedText: string;
      originalPronunciation: string;
      translatedPronunciation: string;
      sourceLanguage: ChatLanguagePayload;
      targetLanguage: ChatLanguagePayload;
      audioBuffer: Buffer;
      audioMimeType: string;
      sourceAudioBuffer: Buffer;
      sourceAudioMimeType: string;
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

export async function runVoiceChatMessage(
  input: RunVoiceChatMessageInput,
): Promise<RunVoiceChatMessageResult> {
  const sourceLanguage = getSupportedTtsLanguage(input.sourceLanguage);
  const targetLanguage = getSupportedTtsLanguage(input.targetLanguage);

  if (!sourceLanguage) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "sourceLanguage is not supported",
        supportedLanguages: CANONICAL_TTS_LANGUAGES,
      },
    };
  }

  if (!targetLanguage) {
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

  const shouldGeneratePronunciationGuidance =
    requiresPhoneticGuide(sourceLanguage.code, targetLanguage.code) ||
    requiresPhoneticGuide(targetLanguage.code, sourceLanguage.code);
  const result = await runSpeechTranslation({
    responseMode: "json",
    sourceLanguage: sourceLanguage.code,
    targetLanguage: targetLanguage.code,
    sourceAudioFile: input.sourceAudioFile,
  });

  if (result.ok === false) {
    return {
      ok: false,
      status: result.status,
      body: result.body,
    };
  }

  let originalPronunciation = "";
  let translatedPronunciation = "";

  if (shouldGeneratePronunciationGuidance) {
    try {
      const guidance = await generatePronunciationGuidance({
        originalText: result.transcript,
        translatedText: result.translation,
        sourceLanguageCode: sourceLanguage.code,
        sourceLanguage: sourceLanguage.name,
        targetLanguageCode: targetLanguage.code,
        targetLanguage: targetLanguage.name,
      });

      originalPronunciation = guidance.originalPronunciation;
      translatedPronunciation = guidance.translatedPronunciation;
    } catch (error) {
      console.error("Voice pronunciation guidance failed", error);
    }
  }

  return {
    ok: true,
    transcript: result.transcript,
    translatedText: result.translation,
    originalPronunciation,
    translatedPronunciation,
    sourceLanguage: {
      code: sourceLanguage.code,
      label: sourceLanguage.name,
    },
    targetLanguage: {
      code: targetLanguage.code,
      label: targetLanguage.name,
    },
    audioBuffer: result.audioBuffer,
    audioMimeType: "audio/wav",
    sourceAudioBuffer: input.sourceAudioFile.buffer,
    sourceAudioMimeType: input.sourceAudioFile.mimeType ?? "audio/webm",
  };
}
