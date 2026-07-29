alter table public.lessons
add column if not exists archived_at timestamptz;

create index if not exists lessons_active_by_user_created_at_idx
on public.lessons (user_id, created_at desc)
where archived_at is null;

create index if not exists lessons_active_by_conversation_idx
on public.lessons (source_conversation_id)
where source_conversation_id is not null
  and archived_at is null;
