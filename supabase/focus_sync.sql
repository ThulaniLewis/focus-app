-- Focus sync: one table that keeps the phone and tablet on the same list.
-- Paste all of this into Supabase: SQL Editor > New query > Run. Safe to run twice.
--
-- Each row is one shared thing (a task, the shared settings, or the list of spaces).
-- Private things (Just for me, Money, sleep, check-ins) are never sent here by the app.
-- Row level security means only your signed-in account can ever read or change your rows.

create table if not exists public.focus_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('task', 'settings', 'spaces')),
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (user_id, id)
);

create index if not exists focus_items_updated on public.focus_items (user_id, updated_at);

-- Every change gets the server's time, so devices agree on what's newest.
create or replace function public.focus_items_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists focus_items_touch on public.focus_items;
create trigger focus_items_touch before insert or update on public.focus_items
for each row execute function public.focus_items_touch();

alter table public.focus_items enable row level security;

drop policy if exists "Only you can see your Focus" on public.focus_items;
create policy "Only you can see your Focus" on public.focus_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Live updates: a change on the phone shows on the tablet within a second or two.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'focus_items'
  ) then
    alter publication supabase_realtime add table public.focus_items;
  end if;
end $$;
