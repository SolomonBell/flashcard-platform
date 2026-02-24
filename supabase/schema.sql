-- Phase 4A: Decks and cards for signed-in users. Run in Supabase SQL Editor.
-- RLS ensures each user sees only their own rows.

-- Table: decks
create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Table: cards
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  front text not null,
  back text not null,
  kind text default 'basic',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for common lookups
create index if not exists decks_user_id_idx on public.decks(user_id);
create index if not exists cards_deck_id_idx on public.cards(deck_id);
create index if not exists cards_user_id_idx on public.cards(user_id);

-- Trigger function: set updated_at on row update
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers for updated_at
drop trigger if exists decks_updated_at on public.decks;
create trigger decks_updated_at
  before update on public.decks
  for each row execute function public.set_updated_at();

drop trigger if exists cards_updated_at on public.cards;
create trigger cards_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

-- Enable RLS on both tables
alter table public.decks enable row level security;
alter table public.cards enable row level security;

-- RLS policies: user can only access their own rows (auth.uid() = user_id)

-- decks
drop policy if exists "decks_select_own" on public.decks;
create policy "decks_select_own" on public.decks for select using (auth.uid() = user_id);
drop policy if exists "decks_insert_own" on public.decks;
create policy "decks_insert_own" on public.decks for insert with check (auth.uid() = user_id);
drop policy if exists "decks_update_own" on public.decks;
create policy "decks_update_own" on public.decks for update using (auth.uid() = user_id);
drop policy if exists "decks_delete_own" on public.decks;
create policy "decks_delete_own" on public.decks for delete using (auth.uid() = user_id);

-- cards
drop policy if exists "cards_select_own" on public.cards;
create policy "cards_select_own" on public.cards for select using (auth.uid() = user_id);
drop policy if exists "cards_insert_own" on public.cards;
create policy "cards_insert_own" on public.cards for insert with check (auth.uid() = user_id);
drop policy if exists "cards_update_own" on public.cards;
create policy "cards_update_own" on public.cards for update using (auth.uid() = user_id);
drop policy if exists "cards_delete_own" on public.cards;
create policy "cards_delete_own" on public.cards for delete using (auth.uid() = user_id);
