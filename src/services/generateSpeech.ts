import type { SupportedTtsLanguage } from "../lib/languages.js";
import {
  generateOpenAiSpeech,
  type OpenAiSpeechVoice,
} from "./generateOpenAiSpeech.js";

export type GenerateSpeechInput = {
  text: string;
  targetLanguage: SupportedTtsLanguage;
  speechVoice?: OpenAiSpeechVoice;
};

export async function generateSpeech(input: GenerateSpeechInput) {
  return generateOpenAiSpeech({
    text: input.text,
    language: input.targetLanguage.name,
    voice: input.speechVoice,
  });
}
