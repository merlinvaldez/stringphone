alter table public.conversations
add column if not exists archived_at timestamptz;

create index if not exists conversations_active_by_user_created_at_idx
on public.conversations (user_id, created_at desc)
where archived_at is null;
