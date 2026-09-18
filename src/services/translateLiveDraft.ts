import { translateText } from "./translateText.js";

type OpenAiOutputContent = {
  type?: unknown;
  text?: unknown;
};

type OpenAiResponseBody = {
  output_text?: unknown;
  output?: Array<{
    content?: OpenAiOutputContent[];
  }>;
  error?: {
    message?: unknown;
  };
};

function extractOutputText(body: OpenAiResponseBody) {
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text.trim();
  }

  return (body.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter(
      (content) =>
        content.type === "output_text" && typeof content.text === "string",
    )
    .map((content) => content.text as string)
    .join("")
    .trim();
}

export async function translateLiveDraft(input: {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return translateText({
      text: input.text,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_LIVE_TRANSLATION_MODEL?.trim() || "gpt-4o-mini",
        store: false,
        instructions:
          "You are a low-latency translation engine. Return only the translation, with no explanation or quotation marks.",
        input: `Source language: ${input.sourceLanguage}\nTarget language: ${input.targetLanguage}\n\nText:\n${input.text}`,
      }),
    });

    const body = (await response.json().catch(() => null)) as OpenAiResponseBody | null;

    if (!response.ok || !body) {
      throw new Error(
        typeof body?.error?.message === "string"
          ? body.error.message
          : "OpenAI live translation failed.",
      );
    }

    const translatedText = extractOutputText(body);

    if (!translatedText) {
      throw new Error("OpenAI live translation returned no text.");
    }

    return translatedText;
  } catch (error) {
    console.warn("Low-latency Live translation failed; using the standard translator.", error);
    return translateText({
      text: input.text,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
    });
  }
}
