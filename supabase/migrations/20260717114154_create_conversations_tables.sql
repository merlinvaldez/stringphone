create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  title text,
  source_language text not null,
  target_language text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender text not null check (sender in ('self', 'partner')),
  original_text text not null,
  translated_text text not null,
  transcript text,
  audio_url text,
  created_at timestamptz not null default now()
);
