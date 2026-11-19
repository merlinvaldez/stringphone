import type { SupportedTtsLanguage } from "../lib/languages.js";
import {
  generateMistralClonedSpeech,
  type GenerateMistralClonedSpeechInput,
} from "./mistralVoiceCloning.js";
import {
  generateOpenAiSpeech,
  type OpenAiSpeechVoice,
} from "./generateOpenAiSpeech.js";

export type GenerateSpeechInput = {
  text: string;
  targetLanguage: SupportedTtsLanguage;
  speechVoice?: OpenAiSpeechVoice;
  clonedVoiceId?: string | null;
  clonedVoiceReferenceAudio?: string | null;
  pronunciationText?: string | null;
};

export type GenerateSpeechDeps = {
  generateOpenAiSpeechImpl?: typeof generateOpenAiSpeech;
  generateClonedSpeechImpl?: (
    input: GenerateMistralClonedSpeechInput,
  ) => Promise<Buffer>;
};

export async function generateSpeech(
  input: GenerateSpeechInput,
  deps: GenerateSpeechDeps = {},
) {
  const openAiSpeech = deps.generateOpenAiSpeechImpl ?? generateOpenAiSpeech;
  const clonedSpeech =
    deps.generateClonedSpeechImpl ?? generateMistralClonedSpeech;
  const clonedVoiceId =
    typeof input.clonedVoiceId === "string" ? input.clonedVoiceId.trim() : "";
  const referenceAudioBase64 =
    typeof input.clonedVoiceReferenceAudio === "string"
      ? input.clonedVoiceReferenceAudio.trim()
      : "";

  if (clonedVoiceId || referenceAudioBase64) {
    try {
      return await clonedSpeech({
        text: input.text,
        targetLanguage: input.targetLanguage,
        clonedVoiceId: clonedVoiceId || undefined,
        referenceAudioBase64: referenceAudioBase64 || undefined,
      });
    } catch {
      console.warn(
        "Cloned speech generation failed; falling back to default OpenAI speech",
      );
    }
  }

  return openAiSpeech({
    text: input.text,
    language: input.targetLanguage.name,
    voice: input.speechVoice,
  });
}
