import { CANONICAL_TTS_LANGUAGES, getSupportedTtsLanguage } from "./languages.js";
import { runSpeechTranslation } from "./runSpeechTranslation.js";

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
      sourceLanguage: ChatLanguagePayload;
      targetLanguage: ChatLanguagePayload;
      audioBuffer: Buffer;
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

  const result = await runSpeechTranslation({
    responseMode: "json",
    targetLanguage: targetLanguage.code,
    sourceAudioFile: input.sourceAudioFile,
    voiceSampleFile: input.voiceSampleFile ?? input.sourceAudioFile,
  });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    transcript: result.transcript,
    translatedText: result.translation,
    sourceLanguage: {
      code: sourceLanguage.code,
      label: sourceLanguage.name,
    },
    targetLanguage: {
      code: targetLanguage.code,
      label: targetLanguage.name,
    },
    audioBuffer: result.audioBuffer,
  };
}
