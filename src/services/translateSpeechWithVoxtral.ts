import { mistral } from "../lib/mistral.js";

const VOXTRAL_TRANSLATION_MODEL =
  process.env.VOXTRAL_TRANSLATION_MODEL ?? "voxtral-mini-latest";

export type TranslateSpeechWithVoxtralInput = {
  audioBuffer: Buffer;
  targetLanguage: string;
};

export type SpeechTranslationResult = {
  transcript: string;
  translation: string;
};

function extractResponseText(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((chunk) => {
        if (
          chunk &&
          typeof chunk === "object" &&
          "text" in chunk &&
          typeof chunk.text === "string"
        ) {
          return chunk.text;
        }

        return "";
      })
      .join("");
  }

  return "";
}

function parseJsonResponse(rawText: string) {
  const trimmed = rawText.trim();
  const fencedJson = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fencedJson?.[1] ?? trimmed;
  return JSON.parse(jsonText) as Partial<SpeechTranslationResult>;
}

export async function translateSpeechWithVoxtral(
  input: TranslateSpeechWithVoxtralInput,
): Promise<SpeechTranslationResult> {
  const audioBase64 = input.audioBuffer.toString("base64");
  const response = await mistral.chat.complete({
    model: VOXTRAL_TRANSLATION_MODEL,
    temperature: 0,
    maxTokens: 1200,
    responseFormat: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are StringPhone's speech translation engine. Analyze the user's audio directly. Return only valid JSON with two string fields: transcript and translation. transcript must be the speaker's original spoken words in the source language. translation must be the same meaning translated into the requested target language. Do not add explanations, markdown, pronunciation notes, or extra keys.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_audio",
            inputAudio: audioBase64,
          },
          {
            type: "text",
            text: `Target language: ${input.targetLanguage}\nReturn JSON exactly like {"transcript":"...","translation":"..."}.`,
          },
        ],
      },
    ],
  });

  const rawText = extractResponseText(response.choices[0]?.message?.content);

  if (!rawText.trim()) {
    throw new Error("Voxtral translation response was empty.");
  }

  const parsed = parseJsonResponse(rawText);
  const transcript = parsed.transcript?.trim();
  const translation = parsed.translation?.trim();

  if (!transcript || !translation) {
    throw new Error(
      "Voxtral translation response did not include transcript and translation.",
    );
  }

  return { transcript, translation };
}
