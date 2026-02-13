-- KnowIt Supabase schema and RLS
-- Run this in Supabase SQL Editor after creating your project.

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Organizations
create table if not exists public.organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz default now()
);

-- Org memberships (user_id references auth.users.id)
create table if not exists public.org_memberships (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz default now(),
  unique(org_id, user_id)
);

-- Classes (belong to org; created_by is auth user)
create table if not exists public.classes (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  allowed_domains text[] default '{}',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- Class memberships (students + co-teachers)
create table if not exists public.class_memberships (
  id uuid primary key default uuid_generate_v4(),
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_in_class text not null default 'student' check (role_in_class in ('teacher', 'student')),
  created_at timestamptz default now(),
  unique(class_id, user_id)
);

-- Decks (owner_user_id; optional org_id for org-scoped decks)
create table if not exists public.decks (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  title text not null default 'Untitled Deck',
  description text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Cards (belong to deck)
create table if not exists public.cards (
  id uuid primary key default uuid_generate_v4(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  front text not null default '',
  back text not null default '',
  long_answer boolean not null default false,
  stage int not null default 1 check (stage between 1 and 3),
  stage3_mastered boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz default now()
);

-- Shared decks (snapshot shared to a class)
create table if not exists public.shared_decks (
  id uuid primary key default uuid_generate_v4(),
  class_id uuid not null references public.classes(id) on delete cascade,
  deck_id uuid references public.decks(id) on delete set null,
  shared_by uuid not null references auth.users(id) on delete cascade,
  snapshot_json jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Shared deck progress (per student)
create table if not exists public.shared_deck_progress (
  id uuid primary key default uuid_generate_v4(),
  shared_deck_id uuid not null references public.shared_decks(id) on delete cascade,
  student_user_id uuid not null references auth.users(id) on delete cascade,
  progress_json jsonb not null default '{}',
  updated_at timestamptz default now(),
  unique(shared_deck_id, student_user_id)
);

-- Analytics sessions
create table if not exists public.analytics_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_context text not null,
  deck_id text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_ms bigint,
  answers_submitted int default 0,
  correct_count int default 0,
  incorrect_count int default 0,
  created_at timestamptz default now()
);

-- Analytics aggregates (per user per deck)
create table if not exists public.analytics_aggregates (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_context text not null,
  deck_id text not null,
  total_sessions int default 0,
  total_time_ms bigint default 0,
  last_studied_at timestamptz,
  latest_stage_distribution_json jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, deck_context, deck_id)
);

-- Optional: profiles for displaying emails (populate via trigger or on first load)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  updated_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select" on public.profiles for select to authenticated using (true);
create policy "profiles_own_update" on public.profiles for update using (auth.uid() = id);
-- Trigger to sync email from auth.users (run in SQL Editor as superuser)
-- create or replace function public.handle_new_user() returns trigger as $$
-- begin insert into public.profiles (id, email) values (new.id, new.email); return new; end; $$ language plpgsql security definer;
-- create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Indexes for common queries
create index if not exists idx_decks_owner on public.decks(owner_user_id);
create index if not exists idx_cards_deck on public.cards(deck_id);
create index if not exists idx_shared_decks_class on public.shared_decks(class_id);
create index if not exists idx_shared_deck_progress_student on public.shared_deck_progress(student_user_id);
create index if not exists idx_class_memberships_class on public.class_memberships(class_id);
create index if not exists idx_class_memberships_user on public.class_memberships(user_id);
create index if not exists idx_org_memberships_org on public.org_memberships(org_id);
create index if not exists idx_org_memberships_user on public.org_memberships(user_id);

-- RLS: enable on all tables
alter table public.organizations enable row level security;
alter table public.org_memberships enable row level security;
alter table public.classes enable row level security;
alter table public.class_memberships enable row level security;
alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.shared_decks enable row level security;
alter table public.shared_deck_progress enable row level security;
alter table public.analytics_sessions enable row level security;
alter table public.analytics_aggregates enable row level security;

-- Policies: organizations (org admins and members can read their orgs)
create policy "org_select" on public.organizations for select
  using (exists (select 1 from public.org_memberships m where m.org_id = organizations.id and m.user_id = auth.uid()));

create policy "org_insert" on public.organizations for insert with check (true);
create policy "org_update" on public.organizations for update
  using (exists (select 1 from public.org_memberships m where m.org_id = organizations.id and m.user_id = auth.uid() and m.role = 'admin'));

-- Org memberships (admins can manage; members can read)
create policy "org_members_select" on public.org_memberships for select
  using (exists (select 1 from public.org_memberships m where m.org_id = org_memberships.org_id and m.user_id = auth.uid()));

create policy "org_members_insert" on public.org_memberships for insert
  with check (exists (select 1 from public.org_memberships m where m.org_id = org_memberships.org_id and m.user_id = auth.uid() and m.role = 'admin'));

create policy "org_members_update" on public.org_memberships for update
  using (exists (select 1 from public.org_memberships m where m.org_id = org_memberships.org_id and m.user_id = auth.uid() and m.role = 'admin'));

create policy "org_members_delete" on public.org_memberships for delete
  using (exists (select 1 from public.org_memberships m where m.org_id = org_memberships.org_id and m.user_id = auth.uid() and m.role = 'admin'));

-- Classes (org members can read; teachers and org admins can manage)
create policy "classes_select" on public.classes for select
  using (
    exists (select 1 from public.org_memberships m where m.org_id = classes.org_id and m.user_id = auth.uid())
    or exists (select 1 from public.class_memberships cm where cm.class_id = classes.id and cm.user_id = auth.uid())
  );

create policy "classes_insert" on public.classes for insert
  with check (auth.uid() = created_by and exists (select 1 from public.org_memberships m where m.org_id = classes.org_id and m.user_id = auth.uid()));

create policy "classes_update" on public.classes for update
  using (
    created_by = auth.uid()
    or exists (select 1 from public.class_memberships cm where cm.class_id = classes.id and cm.user_id = auth.uid() and cm.role_in_class = 'teacher')
    or exists (select 1 from public.org_memberships m where m.org_id = classes.org_id and m.user_id = auth.uid() and m.role = 'admin')
  );

create policy "classes_delete" on public.classes for delete
  using (
    created_by = auth.uid()
    or exists (select 1 from public.org_memberships m where m.org_id = classes.org_id and m.user_id = auth.uid() and m.role = 'admin')
  );

-- Class memberships (teachers and org admins can manage; members can read)
create policy "class_members_select" on public.class_memberships for select
  using (
    exists (select 1 from public.class_memberships cm where cm.class_id = class_memberships.class_id and cm.user_id = auth.uid())
    or exists (select 1 from public.classes c join public.org_memberships m on m.org_id = c.org_id where c.id = class_memberships.class_id and m.user_id = auth.uid())
  );

create policy "class_members_insert" on public.class_memberships for insert
  with check (
    exists (select 1 from public.classes c where c.id = class_memberships.class_id and c.created_by = auth.uid())
    or exists (select 1 from public.class_memberships cm where cm.class_id = class_memberships.class_id and cm.user_id = auth.uid() and cm.role_in_class = 'teacher')
    or exists (select 1 from public.classes c join public.org_memberships m on m.org_id = c.org_id where c.id = class_memberships.class_id and m.user_id = auth.uid() and m.role = 'admin')
  );

create policy "class_members_update" on public.class_memberships for update
  using (
    exists (select 1 from public.classes c where c.id = class_memberships.class_id and c.created_by = auth.uid())
    or exists (select 1 from public.class_memberships cm where cm.class_id = class_memberships.class_id and cm.user_id = auth.uid() and cm.role_in_class = 'teacher')
    or exists (select 1 from public.classes c join public.org_memberships m on m.org_id = c.org_id where c.id = class_memberships.class_id and m.user_id = auth.uid() and m.role = 'admin')
  );

create policy "class_members_delete" on public.class_memberships for delete
  using (
    user_id = auth.uid()
    or exists (select 1 from public.classes c where c.id = class_memberships.class_id and c.created_by = auth.uid())
    or exists (select 1 from public.class_memberships cm where cm.class_id = class_memberships.class_id and cm.user_id = auth.uid() and cm.role_in_class = 'teacher')
    or exists (select 1 from public.classes c join public.org_memberships m on m.org_id = c.org_id where c.id = class_memberships.class_id and m.user_id = auth.uid() and m.role = 'admin')
  );

-- Decks (owner read/write; org admin read/write for org decks)
create policy "decks_select" on public.decks for select
  using (owner_user_id = auth.uid() or (org_id is not null and exists (select 1 from public.org_memberships m where m.org_id = decks.org_id and m.user_id = auth.uid())));

create policy "decks_insert" on public.decks for insert with check (owner_user_id = auth.uid());

create policy "decks_update" on public.decks for update
  using (owner_user_id = auth.uid() or (org_id is not null and exists (select 1 from public.org_memberships m where m.org_id = decks.org_id and m.user_id = auth.uid() and m.role = 'admin')));

create policy "decks_delete" on public.decks for delete using (owner_user_id = auth.uid());

-- Cards (same as deck access via deck_id)
create policy "cards_select" on public.cards for select
  using (exists (select 1 from public.decks d where d.id = cards.deck_id and (d.owner_user_id = auth.uid() or (d.org_id is not null and exists (select 1 from public.org_memberships m where m.org_id = d.org_id and m.user_id = auth.uid())))));

create policy "cards_insert" on public.cards for insert
  with check (exists (select 1 from public.decks d where d.id = cards.deck_id and d.owner_user_id = auth.uid()));

create policy "cards_update" on public.cards for update
  using (exists (select 1 from public.decks d where d.id = cards.deck_id and (d.owner_user_id = auth.uid() or (d.org_id is not null and exists (select 1 from public.org_memberships m where m.org_id = d.org_id and m.user_id = auth.uid())))));

create policy "cards_delete" on public.cards for delete
  using (exists (select 1 from public.decks d where d.id = cards.deck_id and d.owner_user_id = auth.uid()));

-- Shared decks (teachers and class members can read; teachers can manage)
create policy "shared_decks_select" on public.shared_decks for select
  using (
    shared_by = auth.uid()
    or exists (select 1 from public.class_memberships cm where cm.class_id = shared_decks.class_id and cm.user_id = auth.uid())
    or exists (select 1 from public.classes c join public.org_memberships m on m.org_id = c.org_id where c.id = shared_decks.class_id and m.user_id = auth.uid())
  );

create policy "shared_decks_insert" on public.shared_decks for insert with check (shared_by = auth.uid());

create policy "shared_decks_update" on public.shared_decks for update using (shared_by = auth.uid());

create policy "shared_decks_delete" on public.shared_decks for delete using (shared_by = auth.uid());

-- Shared deck progress (students can read/write own; teachers can read)
create policy "shared_deck_progress_select" on public.shared_deck_progress for select
  using (
    student_user_id = auth.uid()
    or exists (select 1 from public.shared_decks sd join public.class_memberships cm on cm.class_id = sd.class_id where sd.id = shared_deck_progress.shared_deck_id and cm.user_id = auth.uid() and cm.role_in_class = 'teacher')
  );

create policy "shared_deck_progress_insert" on public.shared_deck_progress for insert with check (student_user_id = auth.uid());

create policy "shared_deck_progress_update" on public.shared_deck_progress for update using (student_user_id = auth.uid());

create policy "shared_deck_progress_delete" on public.shared_deck_progress for delete using (student_user_id = auth.uid());

-- Analytics: users can only read/write their own
create policy "analytics_sessions_select" on public.analytics_sessions for select using (user_id = auth.uid());
create policy "analytics_sessions_insert" on public.analytics_sessions for insert with check (user_id = auth.uid());

create policy "analytics_aggregates_select" on public.analytics_aggregates for select using (user_id = auth.uid());
create policy "analytics_aggregates_insert" on public.analytics_aggregates for insert with check (user_id = auth.uid());
create policy "analytics_aggregates_update" on public.analytics_aggregates for update using (user_id = auth.uid());
