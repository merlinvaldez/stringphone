alter table public.messages
add column if not exists message_origin text not null default 'human';

create table if not exists public.ai_partner_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.conversations(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  enabled boolean not null default false,
  seeded_at timestamptz,
  disabled_at timestamptz,
  seed_message_id uuid references public.messages(id) on delete set null,
  partner_language text not null,
  display_name text,
  persona_summary text,
  scenario_summary text,
  style_summary text,
  voice_provider text,
  voice_id text,
  voice_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_partner_sessions_by_user_created_at_idx
on public.ai_partner_sessions (user_id, created_at desc);
