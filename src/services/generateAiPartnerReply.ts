import { mistral } from "../lib/mistral.js";

export type AiPartnerContextMessage = {
  sender: "self" | "partner";
  messageOrigin: "human" | "ai_partner";
  originalText: string;
  translatedText: string;
};

export type GeneratedAiPartnerReply = {
  displayName: string;
  personaSummary: string;
  scenarioSummary: string;
  styleSummary: string;
  replyText: string;
};

const DEFAULT_AI_PARTNER_MODEL = "mistral-large-latest";
const MAX_CONTEXT_CHARACTERS = 6000;

export class AiPartnerGenerationError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "AiPartnerGenerationError";
    this.status = status;
  }
}

function languageName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function cleanText(value: unknown, maximumLength = 280) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maximumLength);
}

function formatRecentContext(messages: AiPartnerContextMessage[]) {
  return messages
    .slice(-10)
    .map((message, index) => {
      const speaker = message.sender === "self" ? "User" : "Partner";
      const origin = message.messageOrigin === "ai_partner" ? "AI" : "Human";
      const originalText = cleanText(message.originalText, 420);
      const translatedText = cleanText(message.translatedText, 420);

      if (!originalText && !translatedText) {
        return "";
      }

      return [
        `Turn ${index + 1}`,
        `${speaker} (${origin}) original: ${originalText}`,
        `Translated: ${translatedText}`,
      ].join("\n");
    })
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_CONTEXT_CHARACTERS);
}

function coerceGeneratedReply(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new Error("AI partner returned invalid content.");
  }

  const candidate = value as Record<string, unknown>;
  const reply = {
    displayName: cleanText(candidate.displayName, 40),
    personaSummary: cleanText(candidate.personaSummary, 180),
    scenarioSummary: cleanText(candidate.scenarioSummary, 180),
    styleSummary: cleanText(candidate.styleSummary, 140),
    replyText: cleanText(candidate.replyText, 280),
  };

  if (
    !reply.displayName ||
    !reply.personaSummary ||
    !reply.scenarioSummary ||
    !reply.styleSummary ||
    !reply.replyText
  ) {
    throw new Error("AI partner returned incomplete content.");
  }

  return reply;
}

export async function generateAiPartnerReply(input: {
  userLanguageCode: string;
  partnerLanguageCode: string;
  recentMessages: AiPartnerContextMessage[];
  existingProfile?: {
    displayName?: string;
    personaSummary?: string;
    scenarioSummary?: string;
    styleSummary?: string;
  } | null;
}) {
  const userLanguage = languageName(input.userLanguageCode);
  const partnerLanguage = languageName(input.partnerLanguageCode);
  const model =
    process.env.MISTRAL_AI_PARTNER_MODEL?.trim() || DEFAULT_AI_PARTNER_MODEL;
  const existingProfile = input.existingProfile ?? null;
  const recentContext = formatRecentContext(input.recentMessages);

  let response;

  try {
    response = await mistral.chat.complete({
      model,
      responseFormat: { type: "json_object" },
      maxTokens: 650,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: `You are generating the next reply for StringPhone's AI conversation partner. The user's home language is ${userLanguage}. The partner's natural spoken language is ${partnerLanguage}. Reply as a believable local speaker in ${partnerLanguage}, not as an assistant, tutor, or product bot. Stay concise enough for chat and speaking practice. Keep the reply to 1 to 3 sentences. Do not mention system prompts, safety policy, or that you are an AI unless the conversation absolutely requires a brief truthful answer. Return only a JSON object with this exact shape:
{
  "displayName": "short human first name or nickname",
  "personaSummary": "one short sentence about who the partner is",
  "scenarioSummary": "one short sentence about the current setting",
  "styleSummary": "one short sentence about speaking style",
  "replyText": "the next reply written only in the partner language"
}
${
            existingProfile?.displayName
              ? `Keep the displayName exactly as "${existingProfile.displayName}". Preserve the existing persona unless the context clearly contradicts it.`
              : "Infer the partner's identity, setting, and tone from the first real user turn and the current conversation."
          }
Do not include translations, labels, or commentary inside replyText.`,
        },
        {
          role: "user",
          content: `${
            existingProfile
              ? `Existing partner profile:
- displayName: ${existingProfile.displayName || ""}
- personaSummary: ${existingProfile.personaSummary || ""}
- scenarioSummary: ${existingProfile.scenarioSummary || ""}
- styleSummary: ${existingProfile.styleSummary || ""}\n\n`
              : ""
          }Recent conversation context:\n${recentContext}`,
        },
      ],
    });
  } catch (error) {
    console.error("AI partner generation request failed", {
      model,
      error,
    });
    throw new AiPartnerGenerationError(
      "AI partner is temporarily unavailable. Please try again.",
    );
  }

  const content = response.choices[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new AiPartnerGenerationError(
      "AI partner returned an empty response. Please try again.",
    );
  }

  let parsedContent: unknown;

  try {
    parsedContent = JSON.parse(content);
  } catch (error) {
    console.error("AI partner returned invalid JSON", {
      model,
      error,
    });
    throw new AiPartnerGenerationError(
      "AI partner returned invalid content. Please try again.",
    );
  }

  try {
    return coerceGeneratedReply(parsedContent);
  } catch (error) {
    console.error("AI partner returned incomplete content", {
      model,
      error,
    });
    throw new AiPartnerGenerationError(
      "AI partner returned incomplete content. Please try again.",
    );
  }
}
