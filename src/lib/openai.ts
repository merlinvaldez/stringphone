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

export function getOpenAiApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OpenAI is not configured.");
  }

  return apiKey;
}

export function extractOpenAiOutputText(body: OpenAiResponseBody) {
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

export async function createOpenAiResponse(input: {
  instructions: string;
  input: string;
  model?: string;
  jsonObject?: boolean;
  maxOutputTokens?: number;
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:
        input.model ||
        process.env.OPENAI_TRANSLATION_MODEL?.trim() ||
        "gpt-4o-mini",
      store: false,
      instructions: input.instructions,
      input: input.input,
      ...(input.jsonObject
        ? { text: { format: { type: "json_object" } } }
        : {}),
      ...(input.maxOutputTokens
        ? { max_output_tokens: input.maxOutputTokens }
        : {}),
    }),
  });

  const body = (await response.json().catch(() => null)) as
    | OpenAiResponseBody
    | null;

  if (!response.ok || !body) {
    throw new Error(
      typeof body?.error?.message === "string"
        ? body.error.message
        : "OpenAI response failed.",
    );
  }

  const outputText = extractOpenAiOutputText(body);

  if (!outputText) {
    throw new Error("OpenAI response returned no text.");
  }

  return outputText;
}
