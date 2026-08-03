CREATE TABLE IF NOT EXISTS public.language_collections (
  id uuid PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  language_code text NOT NULL,
  language_name text NOT NULL,
  language_sort_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.language_collection_entries (
  id uuid PRIMARY KEY,
  collection_id uuid NOT NULL REFERENCES public.language_collections(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  phrase_text text NOT NULL,
  phrase_pronunciation text,
  meaning_text text NOT NULL,
  meaning_pronunciation text,
  note_text text,
  source_language_code text NOT NULL,
  target_language_code text NOT NULL,
  source_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  source_message_kind text,
  source_message_sender text,
  source_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS language_collections_active_user_language_idx
ON public.language_collections (user_id, language_code)
WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS language_collections_active_user_sort_idx
ON public.language_collections (user_id, language_sort_name, updated_at DESC)
WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS language_collection_entries_active_collection_idx
ON public.language_collection_entries (collection_id, created_at DESC)
WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS language_collection_entries_active_user_idx
ON public.language_collection_entries (user_id, target_language_code, created_at DESC)
WHERE archived_at IS NULL;
