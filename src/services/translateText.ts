import { mistral } from "../lib/mistral.js";

export type TranslateTextInput = {
  text: string;
  targetLanguage: string;
};

export async function translateText(input: TranslateTextInput) {
  const response = await mistral.chat.complete({
    model: "mistral-small-latest",
    responseFormat: { type: "text" },
    messages: [
      {
        role: "system",
        content:
          "You are a translation engine. Translate the user's text into the requested target language. Return only the translated text with no explanation.",
      },
      {
        role: "user",
        content: `Target Language: ${input.targetLanguage}\n\nText:\n${input.text}`,
      },
    ],
  });

  const translatedText = response.choices[0]?.message?.content;

  if (typeof translatedText !== "string" || !translatedText.trim()) {
    throw new Error("Translation response did not contain plain text.");
  }

  return translatedText.trim();
}
