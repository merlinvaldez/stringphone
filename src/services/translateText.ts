import { createOpenAiResponse } from "../lib/openai.js";

export type TranslateTextInput = {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
};

export async function translateText(input: TranslateTextInput) {
  return createOpenAiResponse({
    instructions:
      "You are a translation engine. Translate the user's text into the requested target language. Return only the translated text with no explanation or quotation marks.",
    input: `${input.sourceLanguage ? `Source language: ${input.sourceLanguage}\n` : ""}Target language: ${input.targetLanguage}\n\nText:\n${input.text}`,
  });
}
