import {
  CANONICAL_TTS_LANGUAGES,
  getSupportedTtsLanguage,
  requiresPhoneticGuide,
} from "./languages.js";
import { runSpeechTranslation } from "./runSpeechTranslation.js";
import { generatePronunciationGuidance } from "../services/generatePronunciationGuidance.js";
import { resolveSavedUserVoiceReference } from "../services/resolveSavedUserVoiceReference.js";
import { transcribeAudio } from "../services/transcribeAudio.js";
import { translateText } from "../services/translateText.js";

type ChatLanguagePayload = {
  code: string;
  label: string;
};

export type RunVoiceChatMessageInput = {
  sourceLanguage: unknown;
  targetLanguage: unknown;
  userId?: number | null;
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

  const usesFarsiChatVoice =
    sourceLanguage.code === "fa" || targetLanguage.code === "fa";
  const shouldGeneratePronunciationGuidance =
    requiresPhoneticGuide(sourceLanguage.code, targetLanguage.code) ||
    requiresPhoneticGuide(targetLanguage.code, sourceLanguage.code);

  if (usesFarsiChatVoice) {
    const transcript = await transcribeAudio({
      audioBuffer: input.sourceAudioFile.buffer,
      filename: input.sourceAudioFile.filename,
      mimeType: input.sourceAudioFile.mimeType,
      sourceLanguage,
      forceProvider: "elevenlabs",
    });

    const translatedText = await translateText({
      text: transcript,
      sourceLanguage: sourceLanguage.name,
      targetLanguage: targetLanguage.name,
    });

    let originalPronunciation = "";
    let translatedPronunciation = "";

    if (shouldGeneratePronunciationGuidance) {
      try {
        const guidance = await generatePronunciationGuidance({
          originalText: transcript,
          translatedText,
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
      transcript,
      translatedText,
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
      audioBuffer: input.sourceAudioFile.buffer,
      audioMimeType: input.sourceAudioFile.mimeType ?? "audio/webm",
    };
  }

  const savedVoiceReference = await resolveSavedUserVoiceReference({
    userId: input.userId,
    targetLanguage,
  });
  const result = await runSpeechTranslation({
    responseMode: "json",
    sourceLanguage: sourceLanguage.code,
    targetLanguage: targetLanguage.code,
    sourceAudioFile: input.sourceAudioFile,
    voiceSampleFile: savedVoiceReference
      ? undefined
      : (input.voiceSampleFile ?? input.sourceAudioFile),
    preparedVoiceSample: savedVoiceReference,
  });

  if (!result.ok) {
    return result;
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
    audioMimeType: "audio/mpeg",
  };
}
