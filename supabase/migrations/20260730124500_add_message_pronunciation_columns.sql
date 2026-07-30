alter table public.messages
add column if not exists original_pronunciation text;

alter table public.messages
add column if not exists translated_pronunciation text;
