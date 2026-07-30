import { db } from "../client.js";

export type AiPartnerSessionRecord = {
  id: string;
  conversation_id: string;
  user_id: number;
  enabled: boolean;
  seeded_at: string | null;
  disabled_at: string | null;
  seed_message_id: string | null;
  partner_language: string;
  display_name: string | null;
  persona_summary: string | null;
  scenario_summary: string | null;
  style_summary: string | null;
  voice_provider: string | null;
  voice_id: string | null;
  voice_label: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

let ensureAiPartnerSessionsSchemaPromise: Promise<void> | null = null;

async function runEnsureAiPartnerSessionsSchema() {
  const result = await db.query<{
    ai_partner_sessions_exists: boolean;
    message_origin_exists: boolean;
  }>(
    `
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'ai_partner_sessions'
      ) AS ai_partner_sessions_exists,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'messages'
          AND column_name = 'message_origin'
      ) AS message_origin_exists
    `,
  );

  if (!result.rows[0]?.message_origin_exists) {
    await db.query(
      `
      ALTER TABLE public.messages
      ADD COLUMN IF NOT EXISTS message_origin text NOT NULL DEFAULT 'human'
      `,
    );
  }

  if (!result.rows[0]?.ai_partner_sessions_exists) {
    await db.query(
      `
      CREATE TABLE IF NOT EXISTS public.ai_partner_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
        user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        enabled boolean NOT NULL DEFAULT false,
        seeded_at timestamptz,
        disabled_at timestamptz,
        seed_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
        partner_language text NOT NULL,
        display_name text,
        persona_summary text,
        scenario_summary text,
        style_summary text,
        voice_provider text,
        voice_id text,
        voice_label text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
      `,
    );
  }

  await db.query(
    `
    CREATE INDEX IF NOT EXISTS ai_partner_sessions_by_user_created_at_idx
    ON public.ai_partner_sessions (user_id, created_at DESC)
    `,
  );
}

async function ensureAiPartnerSessionsSchema() {
  if (!ensureAiPartnerSessionsSchemaPromise) {
    ensureAiPartnerSessionsSchemaPromise =
      runEnsureAiPartnerSessionsSchema().catch((error) => {
        ensureAiPartnerSessionsSchemaPromise = null;
        throw error;
      });
  }

  await ensureAiPartnerSessionsSchemaPromise;
}

export function buildAiPartnerSessionSnapshot(
  session: AiPartnerSessionRecord | null,
  fallbackPartnerLanguage = "",
) {
  return {
    enabled: Boolean(session?.enabled),
    seeded: Boolean(session?.seeded_at),
    partnerLanguage: session?.partner_language ?? fallbackPartnerLanguage,
    displayName: session?.display_name ?? "",
    personaSummary: session?.persona_summary ?? "",
    scenarioSummary: session?.scenario_summary ?? "",
    styleSummary: session?.style_summary ?? "",
    voice:
      session?.voice_provider || session?.voice_id || session?.voice_label
        ? {
            provider: session?.voice_provider ?? "",
            voiceId: session?.voice_id ?? "",
            label: session?.voice_label ?? "",
          }
        : null,
    metadata:
      session?.metadata && typeof session.metadata === "object"
        ? session.metadata
        : {},
  };
}

export async function getAiPartnerSession(params: {
  conversationId: string;
  userId: number;
}) {
  await ensureAiPartnerSessionsSchema();

  const result = await db.query<AiPartnerSessionRecord>(
    `
    SELECT *
    FROM public.ai_partner_sessions
    WHERE conversation_id = $1
      AND user_id = $2
    `,
    [params.conversationId, params.userId],
  );

  return result.rows[0] ?? null;
}

export async function upsertAiPartnerSession(params: {
  conversationId: string;
  userId: number;
  partnerLanguage: string;
  enabled: boolean;
  seededAt?: string | null;
  disabledAt?: string | null;
  seedMessageId?: string | null;
  displayName?: string | null;
  personaSummary?: string | null;
  scenarioSummary?: string | null;
  styleSummary?: string | null;
  voiceProvider?: string | null;
  voiceId?: string | null;
  voiceLabel?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await ensureAiPartnerSessionsSchema();

  const metadataJson = JSON.stringify(params.metadata ?? {});
  const result = await db.query<AiPartnerSessionRecord>(
    `
    INSERT INTO public.ai_partner_sessions (
      conversation_id,
      user_id,
      enabled,
      seeded_at,
      disabled_at,
      seed_message_id,
      partner_language,
      display_name,
      persona_summary,
      scenario_summary,
      style_summary,
      voice_provider,
      voice_id,
      voice_label,
      metadata,
      updated_at
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      CASE WHEN $3 = false THEN COALESCE($5::timestamptz, now()) ELSE NULL END,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12,
      $13,
      $14,
      $15::jsonb,
      now()
    )
    ON CONFLICT (conversation_id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        enabled = EXCLUDED.enabled,
        seeded_at = COALESCE(EXCLUDED.seeded_at, public.ai_partner_sessions.seeded_at),
        disabled_at = CASE
          WHEN EXCLUDED.enabled = false THEN COALESCE(EXCLUDED.disabled_at, now())
          ELSE NULL
        END,
        seed_message_id = COALESCE(EXCLUDED.seed_message_id, public.ai_partner_sessions.seed_message_id),
        partner_language = EXCLUDED.partner_language,
        display_name = COALESCE(EXCLUDED.display_name, public.ai_partner_sessions.display_name),
        persona_summary = COALESCE(EXCLUDED.persona_summary, public.ai_partner_sessions.persona_summary),
        scenario_summary = COALESCE(EXCLUDED.scenario_summary, public.ai_partner_sessions.scenario_summary),
        style_summary = COALESCE(EXCLUDED.style_summary, public.ai_partner_sessions.style_summary),
        voice_provider = COALESCE(EXCLUDED.voice_provider, public.ai_partner_sessions.voice_provider),
        voice_id = COALESCE(EXCLUDED.voice_id, public.ai_partner_sessions.voice_id),
        voice_label = COALESCE(EXCLUDED.voice_label, public.ai_partner_sessions.voice_label),
        metadata = CASE
          WHEN EXCLUDED.metadata = '{}'::jsonb THEN public.ai_partner_sessions.metadata
          ELSE EXCLUDED.metadata
        END,
        updated_at = now()
    RETURNING *
    `,
    [
      params.conversationId,
      params.userId,
      params.enabled,
      params.seededAt ?? null,
      params.disabledAt ?? null,
      params.seedMessageId ?? null,
      params.partnerLanguage,
      params.displayName ?? null,
      params.personaSummary ?? null,
      params.scenarioSummary ?? null,
      params.styleSummary ?? null,
      params.voiceProvider ?? null,
      params.voiceId ?? null,
      params.voiceLabel ?? null,
      metadataJson,
    ],
  );

  return result.rows[0];
}
