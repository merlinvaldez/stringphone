import { getMessages, updateConversationTitle } from "../db/queries/conversations.js";
import { SUPPORTED_TTS_LANGUAGE_OPTIONS } from "../lib/languages.js";
import { mistral } from "../lib/mistral.js";

type StoredConversationMessage = {
  sender: string;
  original_text: string;
  translated_text: string;
  transcript: string | null;
};

type RefreshConversationTitleInput = {
  conversationId: string;
  userId: number;
  sourceLanguageCode: string;
  targetLanguageCode: string;
};

const LANGUAGE_NAME_BY_CODE = Object.fromEntries(
  SUPPORTED_TTS_LANGUAGE_OPTIONS.map((language) => [language.code, language.name]),
) as Record<string, string>;

const TITLE_WORD_LIMIT = 5;
const TITLE_CHARACTER_LIMIT = 32;
const TITLE_MESSAGE_LIMIT = 6;

function getLanguageName(languageCode: string) {
  return LANGUAGE_NAME_BY_CODE[languageCode] ?? languageCode.toUpperCase();
}

function sanitizeTitle(value: string) {
  if (!value) {
    return "";
  }

  const collapsed = value
    .replace(/\s+/g, " ")
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .replace(/[.!?;:,]+$/g, "")
    .trim();

  if (!collapsed) {
    return "";
  }

  const words = collapsed.split(" ").filter(Boolean).slice(0, TITLE_WORD_LIMIT);
  const joined = words.join(" ");

  if (joined.length <= TITLE_CHARACTER_LIMIT) {
    return joined;
  }

  return joined.slice(0, TITLE_CHARACTER_LIMIT).trim();
}

function extractFallbackTopic(messages: StoredConversationMessage[]) {
  const sourceText = messages
    .flatMap((message) => [
      message.original_text,
      message.transcript ?? "",
      message.translated_text,
    ])
    .map((value) => value.replace(/\s+/g, " ").trim())
    .find(Boolean);

  if (!sourceText) {
    return "New chat";
  }

  const cleaned = sourceText
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "New chat";
  }

  return sanitizeTitle(cleaned);
}

async function generateConversationTopic(
  messages: StoredConversationMessage[],
  sourceLanguageCode: string,
  targetLanguageCode: string,
) {
  const messageSummary = messages
    .slice(-TITLE_MESSAGE_LIMIT)
    .map((message, index) => {
      const sourceText = message.original_text || message.transcript || "";
      return `${index + 1}. ${message.sender === "self" ? "User" : "Partner"}: ${sourceText}\nTranslation: ${message.translated_text}`;
    })
    .join("\n\n");

  const response = await mistral.chat.complete({
    model:
      process.env.MISTRAL_CONVERSATION_TITLE_MODEL ??
      process.env.MISTRAL_TRANSLATION_MODEL ??
      "mistral-small-latest",
    responseFormat: { type: "text" },
    messages: [
      {
        role: "system",
        content:
          "You write very short conversation titles. Summarize the topic in 2 to 5 words. Return only the title text. Do not include quotes, emojis, punctuation-heavy formatting, arrows, or language names.",
      },
      {
        role: "user",
        content: `Source language: ${getLanguageName(sourceLanguageCode)}\nTarget language: ${getLanguageName(targetLanguageCode)}\n\nConversation excerpts:\n${messageSummary}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;

  if (typeof content !== "string") {
    return "";
  }

  return sanitizeTitle(content);
}

export async function refreshConversationTitle(
  input: RefreshConversationTitleInput,
) {
  const messages = (await getMessages(input.conversationId)) as StoredConversationMessage[];

  if (!messages.length) {
    return null;
  }

  let topic = "";

  try {
    topic = await generateConversationTopic(
      messages,
      input.sourceLanguageCode,
      input.targetLanguageCode,
    );
  } catch (error) {
    console.error("Failed to generate conversation title", error);
  }

  const title = topic || extractFallbackTopic(messages);

  return updateConversationTitle({
    conversationId: input.conversationId,
    userId: input.userId,
    title,
  });
}
