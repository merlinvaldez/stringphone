import { db } from "../client.js";

let ensureVoiceSamplesSchemaPromise: Promise<void> | null = null;

type VoiceSampleSchemaExistsRow = {
  voice_samples_exists: boolean;
};

export type StoredVoiceSample = {
  id: string;
  user_id: number;
  source_conversation_id: string | null;
  source_language: string | null;
  target_language: string | null;
  audio_url: string;
  created_at: string;
};

type VoiceSampleLookupRow = {
  created_at: string;
  audio_url: string;
};

async function runEnsureVoiceSamplesSchema() {
  const tableResult = await db.query<VoiceSampleSchemaExistsRow>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'voice_samples'
    ) AS voice_samples_exists
    `,
  );

  if (!tableResult.rows[0]?.voice_samples_exists) {
    await db.query(
      `
      CREATE TABLE IF NOT EXISTS public.voice_samples (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        source_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
        source_language text,
        target_language text,
        audio_url text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
      `,
    );
  }

  await db.query(
    `
    CREATE INDEX IF NOT EXISTS voice_samples_by_user_created_at_idx
    ON public.voice_samples (user_id, created_at DESC)
    `,
  );

  await db.query(
    `
    DROP INDEX IF EXISTS public.voice_samples_by_user_target_language_created_at_idx
    `,
  );
}

async function ensureVoiceSamplesSchema() {
  if (!ensureVoiceSamplesSchemaPromise) {
    ensureVoiceSamplesSchemaPromise = runEnsureVoiceSamplesSchema().catch((error) => {
      ensureVoiceSamplesSchemaPromise = null;
      throw error;
    });
  }

  await ensureVoiceSamplesSchemaPromise;
}

export async function createVoiceSample(params: {
  userId: number;
  sourceConversationId: string | null;
  audioUrl: string;
}) {
  await ensureVoiceSamplesSchema();

  const result = await db.query<StoredVoiceSample>(
    `
    INSERT INTO public.voice_samples (
      user_id,
      source_conversation_id,
      audio_url
    )
    VALUES ($1, $2, $3)
    RETURNING *
    `,
    [
      params.userId,
      params.sourceConversationId,
      params.audioUrl,
    ],
  );

  return result.rows[0] ?? null;
}

export async function getLatestUserVoiceSample(params: {
  userId: number;
}) {
  const samples = await getRecentUserVoiceSamples({
    userId: params.userId,
    limit: 1,
  });

  return samples[0] ?? null;
}

export async function getRecentUserVoiceSamples(params: {
  userId: number;
  limit?: number;
}) {
  await ensureVoiceSamplesSchema();
  const limit = Math.max(1, Math.min(params.limit ?? 5, 20));

  const result = await db.query<VoiceSampleLookupRow>(
    `
    SELECT
      vs.created_at,
      vs.audio_url
    FROM public.voice_samples vs
    WHERE vs.user_id = $1
      AND btrim(vs.audio_url) <> ''
    ORDER BY vs.created_at DESC
    LIMIT $2
    `,
    [params.userId, limit],
  );

  return result.rows;
}
