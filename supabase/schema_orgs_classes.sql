-- Phase 5A-1: Orgs, classes, deck assignments. Students get read-only access to assigned decks/cards.
-- Run after supabase/schema.sql (decks + cards must exist).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists public.org_memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'teacher')),
  created_at timestamptz default now(),
  primary key (org_id, user_id)
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists public.class_teachers (
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (class_id, user_id)
);

create table if not exists public.class_students (
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (class_id, user_id)
);

create table if not exists public.class_deck_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  deck_id uuid not null references public.decks(id) on delete cascade,
  assigned_by uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamptz default now(),
  unique (class_id, deck_id)
);

-- Indexes on foreign keys
create index if not exists org_memberships_org_id_idx on public.org_memberships(org_id);
create index if not exists org_memberships_user_id_idx on public.org_memberships(user_id);
create index if not exists classes_org_id_idx on public.classes(org_id);
create index if not exists classes_created_by_idx on public.classes(created_by);
create index if not exists class_teachers_class_id_idx on public.class_teachers(class_id);
create index if not exists class_teachers_user_id_idx on public.class_teachers(user_id);
create index if not exists class_students_class_id_idx on public.class_students(class_id);
create index if not exists class_students_user_id_idx on public.class_students(user_id);
create index if not exists class_deck_assignments_class_id_idx on public.class_deck_assignments(class_id);
create index if not exists class_deck_assignments_deck_id_idx on public.class_deck_assignments(deck_id);

-- Creator becomes org admin on insert
create or replace function public.add_org_creator_as_admin()
returns trigger as $$
begin
  insert into public.org_memberships (org_id, user_id, role)
  values (new.id, new.created_by, 'admin');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists org_creator_admin on public.organizations;
create trigger org_creator_admin
  after insert on public.organizations
  for each row execute function public.add_org_creator_as_admin();

-- ---------------------------------------------------------------------------
-- RLS: organizations
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;

-- SELECT: member of org or creator
drop policy if exists "orgs_select" on public.organizations;
create policy "orgs_select" on public.organizations for select using (
  created_by = auth.uid()
  or exists (
    select 1 from public.org_memberships m
    where m.org_id = organizations.id and m.user_id = auth.uid()
  )
);

-- INSERT: anyone can create (trigger adds them as admin)
drop policy if exists "orgs_insert" on public.organizations;
create policy "orgs_insert" on public.organizations for insert with check (created_by = auth.uid());

-- UPDATE/DELETE: only org admins
drop policy if exists "orgs_update" on public.organizations;
create policy "orgs_update" on public.organizations for update using (
  exists (select 1 from public.org_memberships m where m.org_id = organizations.id and m.user_id = auth.uid() and m.role = 'admin')
);
drop policy if exists "orgs_delete" on public.organizations;
create policy "orgs_delete" on public.organizations for delete using (
  exists (select 1 from public.org_memberships m where m.org_id = organizations.id and m.user_id = auth.uid() and m.role = 'admin')
);

-- ---------------------------------------------------------------------------
-- RLS: org_memberships
-- ---------------------------------------------------------------------------
alter table public.org_memberships enable row level security;

-- SELECT: members can see memberships in their org
drop policy if exists "org_memberships_select" on public.org_memberships;
create policy "org_memberships_select" on public.org_memberships for select using (
  exists (select 1 from public.org_memberships m2 where m2.org_id = org_memberships.org_id and m2.user_id = auth.uid())
);

-- INSERT/DELETE: only org admins (trigger inserts first admin for new org, so we need to allow that; the trigger is security definer so it bypasses RLS)
-- INSERT: org creator can add themselves (for trigger); otherwise only org admins
drop policy if exists "org_memberships_insert" on public.org_memberships;
create policy "org_memberships_insert" on public.org_memberships for insert with check (
  (exists (select 1 from public.organizations o where o.id = org_memberships.org_id and o.created_by = auth.uid() and org_memberships.user_id = auth.uid()))
  or exists (select 1 from public.org_memberships m where m.org_id = org_memberships.org_id and m.user_id = auth.uid() and m.role = 'admin')
);
drop policy if exists "org_memberships_delete" on public.org_memberships;
create policy "org_memberships_delete" on public.org_memberships for delete using (
  exists (select 1 from public.org_memberships m where m.org_id = org_memberships.org_id and m.user_id = auth.uid() and m.role = 'admin')
);

-- ---------------------------------------------------------------------------
-- RLS: classes
-- ---------------------------------------------------------------------------
alter table public.classes enable row level security;

-- SELECT: org members (admin or teacher) or class teachers can see
drop policy if exists "classes_select" on public.classes;
create policy "classes_select" on public.classes for select using (
  exists (select 1 from public.org_memberships m where m.org_id = classes.org_id and m.user_id = auth.uid())
  or exists (select 1 from public.class_teachers t where t.class_id = classes.id and t.user_id = auth.uid())
  or exists (select 1 from public.class_students s where s.class_id = classes.id and s.user_id = auth.uid())
);

-- INSERT: org admin or teacher
drop policy if exists "classes_insert" on public.classes;
create policy "classes_insert" on public.classes for insert with check (
  exists (select 1 from public.org_memberships m where m.org_id = classes.org_id and m.user_id = auth.uid())
);

-- UPDATE/DELETE: org admin or teacher
drop policy if exists "classes_update" on public.classes;
create policy "classes_update" on public.classes for update using (
  exists (select 1 from public.org_memberships m where m.org_id = classes.org_id and m.user_id = auth.uid())
);
drop policy if exists "classes_delete" on public.classes;
create policy "classes_delete" on public.classes for delete using (
  exists (select 1 from public.org_memberships m where m.org_id = classes.org_id and m.user_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- RLS: class_teachers
-- ---------------------------------------------------------------------------
alter table public.class_teachers enable row level security;

-- SELECT: org members or class teachers or students (see who teaches)
drop policy if exists "class_teachers_select" on public.class_teachers;
create policy "class_teachers_select" on public.class_teachers for select using (
  exists (select 1 from public.classes c join public.org_memberships m on m.org_id = c.org_id where c.id = class_teachers.class_id and m.user_id = auth.uid())
  or exists (select 1 from public.class_students s where s.class_id = class_teachers.class_id and s.user_id = auth.uid())
);

-- INSERT/UPDATE/DELETE: org admin or class teacher
drop policy if exists "class_teachers_insert" on public.class_teachers;
create policy "class_teachers_insert" on public.class_teachers for insert with check (
  exists (select 1 from public.classes c join public.org_memberships m on m.org_id = c.org_id where c.id = class_teachers.class_id and m.user_id = auth.uid())
  or exists (select 1 from public.class_teachers t where t.class_id = class_teachers.class_id and t.user_id = auth.uid())
);
drop policy if exists "class_teachers_delete" on public.class_teachers;
create policy "class_teachers_delete" on public.class_teachers for delete using (
  exists (select 1 from public.classes c join public.org_memberships m on m.org_id = c.org_id where c.id = class_teachers.class_id and m.user_id = auth.uid())
  or exists (select 1 from public.class_teachers t where t.class_id = class_teachers.class_id and t.user_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- RLS: class_students
-- ---------------------------------------------------------------------------
alter table public.class_students enable row level security;

-- SELECT: org members, class teachers, or the student themselves
drop policy if exists "class_students_select" on public.class_students;
create policy "class_students_select" on public.class_students for select using (
  user_id = auth.uid()
  or exists (select 1 from public.classes c join public.org_memberships m on m.org_id = c.org_id where c.id = class_students.class_id and m.user_id = auth.uid())
  or exists (select 1 from public.class_teachers t where t.class_id = class_students.class_id and t.user_id = auth.uid())
);

-- INSERT/DELETE: org admin or class teacher
drop policy if exists "class_students_insert" on public.class_students;
create policy "class_students_insert" on public.class_students for insert with check (
  exists (select 1 from public.classes c join public.org_memberships m on m.org_id = c.org_id where c.id = class_students.class_id and m.user_id = auth.uid())
  or exists (select 1 from public.class_teachers t where t.class_id = class_students.class_id and t.user_id = auth.uid())
);
drop policy if exists "class_students_delete" on public.class_students;
create policy "class_students_delete" on public.class_students for delete using (
  exists (select 1 from public.classes c join public.org_memberships m on m.org_id = c.org_id where c.id = class_students.class_id and m.user_id = auth.uid())
  or exists (select 1 from public.class_teachers t where t.class_id = class_students.class_id and t.user_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- RLS: class_deck_assignments
-- ---------------------------------------------------------------------------
alter table public.class_deck_assignments enable row level security;

-- SELECT: org members, class teachers, or students in that class
drop policy if exists "class_deck_assignments_select" on public.class_deck_assignments;
create policy "class_deck_assignments_select" on public.class_deck_assignments for select using (
  exists (select 1 from public.classes c join public.org_memberships m on m.org_id = c.org_id where c.id = class_deck_assignments.class_id and m.user_id = auth.uid())
  or exists (select 1 from public.class_teachers t where t.class_id = class_deck_assignments.class_id and t.user_id = auth.uid())
  or exists (select 1 from public.class_students s where s.class_id = class_deck_assignments.class_id and s.user_id = auth.uid())
);

-- INSERT/UPDATE/DELETE: org admin or class teacher
drop policy if exists "class_deck_assignments_insert" on public.class_deck_assignments;
create policy "class_deck_assignments_insert" on public.class_deck_assignments for insert with check (
  exists (select 1 from public.classes c join public.org_memberships m on m.org_id = c.org_id where c.id = class_deck_assignments.class_id and m.user_id = auth.uid())
  or exists (select 1 from public.class_teachers t where t.class_id = class_deck_assignments.class_id and t.user_id = auth.uid())
);
drop policy if exists "class_deck_assignments_update" on public.class_deck_assignments;
create policy "class_deck_assignments_update" on public.class_deck_assignments for update using (
  exists (select 1 from public.classes c join public.org_memberships m on m.org_id = c.org_id where c.id = class_deck_assignments.class_id and m.user_id = auth.uid())
  or exists (select 1 from public.class_teachers t where t.class_id = class_deck_assignments.class_id and t.user_id = auth.uid())
);
drop policy if exists "class_deck_assignments_delete" on public.class_deck_assignments;
create policy "class_deck_assignments_delete" on public.class_deck_assignments for delete using (
  exists (select 1 from public.classes c join public.org_memberships m on m.org_id = c.org_id where c.id = class_deck_assignments.class_id and m.user_id = auth.uid())
  or exists (select 1 from public.class_teachers t where t.class_id = class_deck_assignments.class_id and t.user_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- RLS: extra SELECT on decks/cards for assigned (read-only for students)
-- Keep existing owner policies; add one more SELECT when deck/cards are assigned to a class the user is in.
-- ---------------------------------------------------------------------------

drop policy if exists "decks_select_assigned" on public.decks;
create policy "decks_select_assigned" on public.decks for select using (
  exists (
    select 1 from public.class_deck_assignments a
    join public.class_students s on s.class_id = a.class_id
    where a.deck_id = decks.id and s.user_id = auth.uid()
  )
);

drop policy if exists "cards_select_assigned" on public.cards;
create policy "cards_select_assigned" on public.cards for select using (
  exists (
    select 1 from public.class_deck_assignments a
    join public.class_students s on s.class_id = a.class_id
    where a.deck_id = cards.deck_id and s.user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- Convenience views (security_invoker so RLS applies as current user)
-- ---------------------------------------------------------------------------

create or replace view public.v_assigned_decks
with (security_invoker = true)
as
select
  a.deck_id,
  a.class_id,
  c.name as class_name,
  c.org_id,
  a.assigned_at
from public.class_deck_assignments a
join public.classes c on c.id = a.class_id
join public.class_students s on s.class_id = a.class_id and s.user_id = auth.uid();

create or replace view public.v_assigned_cards
with (security_invoker = true)
as
select card.*
from public.cards card
where exists (
  select 1 from public.class_deck_assignments a
  join public.class_students s on s.class_id = a.class_id
  where a.deck_id = card.deck_id and s.user_id = auth.uid()
);
