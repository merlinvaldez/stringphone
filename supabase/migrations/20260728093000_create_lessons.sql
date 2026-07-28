create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  source text not null check (source in ('chat', 'topic')),
  source_conversation_id uuid references public.conversations(id) on delete set null,
  topic text not null,
  source_language text not null,
  target_language text not null,
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists lessons_by_user_created_at_idx
on public.lessons (user_id, created_at desc);

create index if not exists lessons_by_conversation_idx
on public.lessons (source_conversation_id)
where source_conversation_id is not null;
