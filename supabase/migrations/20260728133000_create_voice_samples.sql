create table if not exists public.voice_samples (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  source_conversation_id uuid references public.conversations(id) on delete set null,
  source_language text,
  target_language text,
  audio_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists voice_samples_by_user_created_at_idx
on public.voice_samples (user_id, created_at desc);

create index if not exists voice_samples_by_user_target_language_created_at_idx
on public.voice_samples (user_id, target_language, created_at desc);
