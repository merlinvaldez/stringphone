import { db } from "../client.js";

export type StoredLesson = {
  id: string;
  user_id: number;
  source: "chat" | "topic";
  source_conversation_id: string | null;
  topic: string;
  source_language: string;
  target_language: string;
  content: Record<string, unknown>;
  created_at: string;
};

export async function createLesson(params: {
  userId: number;
  source: "chat" | "topic";
  sourceConversationId: string | null;
  topic: string;
  sourceLanguage: string;
  targetLanguage: string;
  content: Record<string, unknown>;
}) {
  const result = await db.query<StoredLesson>(
    `
    INSERT INTO public.lessons (
      user_id,
      source,
      source_conversation_id,
      topic,
      source_language,
      target_language,
      content
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    RETURNING *
    `,
    [
      params.userId,
      params.source,
      params.sourceConversationId,
      params.topic,
      params.sourceLanguage,
      params.targetLanguage,
      JSON.stringify(params.content),
    ],
  );

  return result.rows[0];
}

export async function getLessons(userId: number) {
  const result = await db.query<StoredLesson>(
    `
    SELECT id, user_id, source, source_conversation_id, topic,
           source_language, target_language, content, created_at
    FROM public.lessons
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [userId],
  );

  return result.rows;
}
