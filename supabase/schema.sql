-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- It creates the tables, the public storage bucket, and the access rules.

-- =========================================================
-- Tables
-- =========================================================

create table if not exists projects (
  id           uuid primary key default gen_random_uuid(),
  title        text not null default 'Untitled room',
  photo_path   text not null,                 -- path within the 'rooms' storage bucket
  photo_w      int  not null,
  photo_h      int  not null,
  regions      jsonb not null default '[]',   -- [{name, pts, occ}]
  edit_key     text not null,                 -- secret; only the creator's link carries it
  created_at   timestamptz not null default now()
);

create table if not exists schemes (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  author_name  text not null default 'Anonymous',
  colors       jsonb not null default '[]',   -- [{color, strength}] aligned to regions by index
  in_gallery   boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists schemes_project_idx on schemes(project_id);
create index if not exists schemes_gallery_idx on schemes(project_id, in_gallery);

-- =========================================================
-- Storage bucket for uploaded photos (public read)
-- =========================================================

insert into storage.buckets (id, name, public)
values ('rooms', 'rooms', true)
on conflict (id) do nothing;

-- Allow anyone to read photos, and allow uploads (writes are also gated in our API).
drop policy if exists "rooms public read" on storage.objects;
create policy "rooms public read" on storage.objects
  for select using (bucket_id = 'rooms');

drop policy if exists "rooms public insert" on storage.objects;
create policy "rooms public insert" on storage.objects
  for insert with check (bucket_id = 'rooms');

-- =========================================================
-- Row Level Security
--
-- We keep the edit_key OUT of anon-readable columns by using a view for public
-- reads. All writes go through our Next.js API routes using the service role
-- key, which bypasses RLS, so the real authorization (checking edit_key) lives
-- in the server code. RLS here is the backstop for the anon key.
-- =========================================================

alter table projects enable row level security;
alter table schemes  enable row level security;

-- Public can read projects, but NOT the edit_key column. Column-level privileges:
revoke all on projects from anon;
grant select (id, title, photo_path, photo_w, photo_h, regions, created_at) on projects to anon;

drop policy if exists "projects anon select" on projects;
create policy "projects anon select" on projects for select to anon using (true);

-- Schemes: anon may read gallery entries only. Everything else via server.
grant select on schemes to anon;
drop policy if exists "schemes gallery select" on schemes;
create policy "schemes gallery select" on schemes
  for select to anon using (in_gallery = true);
