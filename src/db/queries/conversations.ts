import { db } from "../client.js";

let ensureConversationArchivingSchemaPromise: Promise<void> | null = null;
let ensureMessagePronunciationSchemaPromise: Promise<void> | null = null;

async function runEnsureConversationArchivingSchema() {
  const columnResult = await db.query<{
    archived_at_exists: boolean;
  }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'conversations'
        AND column_name = 'archived_at'
    ) AS archived_at_exists
    `
  );

  if (columnResult.rows[0]?.archived_at_exists) {
    return;
  }

  await db.query(
    `
    ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS archived_at timestamptz
    `
  );

  try {
    await db.query(
      `
      CREATE INDEX IF NOT EXISTS conversations_active_by_user_created_at_idx
      ON public.conversations (user_id, created_at DESC)
      WHERE archived_at IS NULL
      `
    );
  } catch (error) {
    console.warn("Failed to create conversation archiving index", error);
  }
}

async function ensureConversationArchivingSchema() {
  if (!ensureConversationArchivingSchemaPromise) {
    ensureConversationArchivingSchemaPromise =
      runEnsureConversationArchivingSchema().catch((error) => {
        ensureConversationArchivingSchemaPromise = null;
        throw error;
      });
  }

  await ensureConversationArchivingSchemaPromise;
}

async function runEnsureMessagePronunciationSchema() {
  const columnResult = await db.query<{
    original_pronunciation_exists: boolean;
    translated_pronunciation_exists: boolean;
  }>(
    `
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'messages'
          AND column_name = 'original_pronunciation'
      ) AS original_pronunciation_exists,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'messages'
          AND column_name = 'translated_pronunciation'
      ) AS translated_pronunciation_exists
    `,
  );

  if (!columnResult.rows[0]?.original_pronunciation_exists) {
    await db.query(
      `
      ALTER TABLE public.messages
      ADD COLUMN IF NOT EXISTS original_pronunciation text
      `,
    );
  }

  if (!columnResult.rows[0]?.translated_pronunciation_exists) {
    await db.query(
      `
      ALTER TABLE public.messages
      ADD COLUMN IF NOT EXISTS translated_pronunciation text
      `,
    );
  }
}

async function ensureMessagePronunciationSchema() {
  if (!ensureMessagePronunciationSchemaPromise) {
    ensureMessagePronunciationSchemaPromise =
      runEnsureMessagePronunciationSchema().catch((error) => {
        ensureMessagePronunciationSchemaPromise = null;
        throw error;
      });
  }

  await ensureMessagePronunciationSchemaPromise;
}

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
  await ensureConversationArchivingSchema();

  const result = await db.query(
    `
    SELECT * FROM public.conversations
    WHERE user_id = $1
      AND archived_at IS NULL
    ORDER BY created_at DESC
    `,
    [userId]
  );
  return result.rows;
}

export async function getConversation(conversationId: string, userId: number) {
  await ensureConversationArchivingSchema();

  const result = await db.query(
    `
    SELECT * FROM public.conversations
    WHERE id = $1
      AND user_id = $2
      AND archived_at IS NULL
    `,
    [conversationId, userId]
  );
  return result.rows[0];
}

export async function archiveConversation(params: {
  conversationId: string;
  userId: number;
}) {
  await ensureConversationArchivingSchema();

  const result = await db.query(
    `
    UPDATE public.conversations
    SET archived_at = now(),
        updated_at = now()
    WHERE id = $1
      AND user_id = $2
      AND archived_at IS NULL
    RETURNING *
    `,
    [params.conversationId, params.userId]
  );
  return result.rows[0];
}

export async function updateConversationLanguages(params: {
  conversationId: string;
  userId: number;
  sourceLanguage: string;
  targetLanguage: string;
}) {
  await ensureConversationArchivingSchema();

  const result = await db.query(
    `
    UPDATE public.conversations
    SET source_language = $1,
        target_language = $2,
        updated_at = now()
    WHERE id = $3
      AND user_id = $4
      AND archived_at IS NULL
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

export async function updateConversationTitle(params: {
  conversationId: string;
  userId: number;
  title: string;
}) {
  await ensureConversationArchivingSchema();

  const result = await db.query(
    `
    UPDATE public.conversations
    SET title = $1,
        updated_at = now()
    WHERE id = $2
      AND user_id = $3
      AND archived_at IS NULL
    RETURNING *
    `,
    [params.title, params.conversationId, params.userId]
  );
  return result.rows[0];
}

export async function createMessage(params: {
  conversationId: string;
  sender: string;
  originalText: string;
  originalPronunciation: string | null;
  translatedText: string;
  translatedPronunciation: string | null;
  transcript: string | null;
  audioUrl: string | null;
}) {
  await ensureMessagePronunciationSchema();

  const result = await db.query(
    `
    INSERT INTO public.messages (
      conversation_id,
      sender,
      original_text,
      original_pronunciation,
      translated_text,
      translated_pronunciation,
      transcript,
      audio_url
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
    `,
    [
      params.conversationId,
      params.sender,
      params.originalText,
      params.originalPronunciation,
      params.translatedText,
      params.translatedPronunciation,
      params.transcript,
      params.audioUrl,
    ]
  );
  return result.rows[0];
}

export async function getMessages(conversationId: string) {
  await ensureMessagePronunciationSchema();

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
