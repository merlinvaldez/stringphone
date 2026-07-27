import { db } from "../client.js";

export async function createConversation(params: {
  userId: number;
  title: string;
  sourceLanguage: string;
  targetLanguage: string;
}) {
  const result = await db.query(
    `
    INSERT INTO public.conversations (user_id, title, source_language, target_language)
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [params.userId, params.title, params.sourceLanguage, params.targetLanguage]
  );
  return result.rows[0];
}

export async function getConversations(userId: number) {
  const result = await db.query(
    `
    SELECT * FROM public.conversations
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [userId]
  );
  return result.rows;
}

export async function getConversation(conversationId: string, userId: number) {
  const result = await db.query(
    `
    SELECT * FROM public.conversations
    WHERE id = $1 AND user_id = $2
    `,
    [conversationId, userId]
  );
  return result.rows[0];
}

export async function updateConversationLanguages(params: {
  conversationId: string;
  userId: number;
  sourceLanguage: string;
  targetLanguage: string;
}) {
  const result = await db.query(
    `
    UPDATE public.conversations
    SET source_language = $1,
        target_language = $2,
        updated_at = now()
    WHERE id = $3 AND user_id = $4
    RETURNING *
    `,
    [
      params.sourceLanguage,
      params.targetLanguage,
      params.conversationId,
      params.userId,
    ]
  );
  return result.rows[0];
}

export async function createMessage(params: {
  conversationId: string;
  sender: string;
  originalText: string;
  translatedText: string;
  transcript: string | null;
  audioUrl: string | null;
}) {
  const result = await db.query(
    `
    INSERT INTO public.messages (conversation_id, sender, original_text, translated_text, transcript, audio_url)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [
      params.conversationId,
      params.sender,
      params.originalText,
      params.translatedText,
      params.transcript,
      params.audioUrl
    ]
  );
  return result.rows[0];
}

export async function getMessages(conversationId: string) {
  const result = await db.query(
    `
    SELECT * FROM public.messages
    WHERE conversation_id = $1
    ORDER BY created_at ASC
    `,
    [conversationId]
  );
  return result.rows;
}
