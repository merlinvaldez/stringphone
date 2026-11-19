import type { SupportedTtsLanguage } from "../lib/languages.js";
import {
  generateFishClonedSpeech,
  type GenerateFishClonedSpeechInput,
} from "./fishVoiceCloning.js";
import {
  generateOpenAiSpeech,
  type OpenAiSpeechVoice,
} from "./generateOpenAiSpeech.js";

export type GenerateSpeechInput = {
  text: string;
  targetLanguage: SupportedTtsLanguage;
  speechVoice?: OpenAiSpeechVoice;
  clonedVoiceId?: string | null;
  pronunciationText?: string | null;
};

export type GenerateSpeechDeps = {
  generateOpenAiSpeechImpl?: typeof generateOpenAiSpeech;
  generateFishClonedSpeechImpl?: (
    input: GenerateFishClonedSpeechInput,
  ) => Promise<Buffer>;
};

export async function generateSpeech(
  input: GenerateSpeechInput,
  deps: GenerateSpeechDeps = {},
) {
  const openAiSpeech = deps.generateOpenAiSpeechImpl ?? generateOpenAiSpeech;
  const fishClonedSpeech =
    deps.generateFishClonedSpeechImpl ?? generateFishClonedSpeech;
  const clonedVoiceId =
    typeof input.clonedVoiceId === "string" ? input.clonedVoiceId.trim() : "";

  if (clonedVoiceId) {
    try {
      return await fishClonedSpeech({
        text: input.text,
        targetLanguage: input.targetLanguage,
        clonedVoiceId,
        pronunciationText: input.pronunciationText,
      });
    } catch {
      console.warn(
        "Fish Audio cloned speech generation failed; falling back to default OpenAI speech",
      );
    }
  }

  return openAiSpeech({
    text: input.text,
    language: input.targetLanguage.name,
    voice: input.speechVoice,
  });
}
