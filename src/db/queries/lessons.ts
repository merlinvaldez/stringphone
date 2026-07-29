import { db } from "../client.js";

let ensureLessonArchivingSchemaPromise: Promise<void> | null = null;

type LessonArchivingSchemaRow = {
  archived_at_exists: boolean;
};

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
  archived_at?: string | null;
};

async function runEnsureLessonArchivingSchema() {
  const columnResult = await db.query<LessonArchivingSchemaRow>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'lessons'
        AND column_name = 'archived_at'
    ) AS archived_at_exists
    `,
  );

  if (!columnResult.rows[0]?.archived_at_exists) {
    await db.query(
      `
      ALTER TABLE public.lessons
      ADD COLUMN IF NOT EXISTS archived_at timestamptz
      `,
    );
  }

  await db.query(
    `
    CREATE INDEX IF NOT EXISTS lessons_active_by_user_created_at_idx
    ON public.lessons (user_id, created_at DESC)
    WHERE archived_at IS NULL
    `,
  );

  await db.query(
    `
    CREATE INDEX IF NOT EXISTS lessons_active_by_conversation_idx
    ON public.lessons (source_conversation_id)
    WHERE source_conversation_id IS NOT NULL
      AND archived_at IS NULL
    `,
  );
}

async function ensureLessonArchivingSchema() {
  if (!ensureLessonArchivingSchemaPromise) {
    ensureLessonArchivingSchemaPromise = runEnsureLessonArchivingSchema().catch(
      (error) => {
        ensureLessonArchivingSchemaPromise = null;
        throw error;
      },
    );
  }

  await ensureLessonArchivingSchemaPromise;
}

export async function createLesson(params: {
  userId: number;
  source: "chat" | "topic";
  sourceConversationId: string | null;
  topic: string;
  sourceLanguage: string;
  targetLanguage: string;
  content: Record<string, unknown>;
}) {
  await ensureLessonArchivingSchema();

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
  await ensureLessonArchivingSchema();

  const result = await db.query<StoredLesson>(
    `
    SELECT id, user_id, source, source_conversation_id, topic,
           source_language, target_language, content, created_at, archived_at
    FROM public.lessons
    WHERE user_id = $1
      AND archived_at IS NULL
    ORDER BY created_at DESC
    `,
    [userId],
  );

  return result.rows;
}

export async function archiveLesson(params: {
  lessonId: string;
  userId: number;
}) {
  await ensureLessonArchivingSchema();

  const result = await db.query<StoredLesson>(
    `
    UPDATE public.lessons
    SET archived_at = now()
    WHERE id = $1
      AND user_id = $2
      AND archived_at IS NULL
    RETURNING *
    `,
    [params.lessonId, params.userId],
  );

  return result.rows[0] ?? null;
}
