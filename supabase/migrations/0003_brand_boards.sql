-- Brand boards: a team's colors, fonts and logos, saved so the customer can
-- start other jerseys from the same brand. Each design also carries its own
-- copy in spec.brand, so designs keep working without this table.
create table if not exists public.brand_boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  anon_id uuid, -- set while an anonymous visitor owns it
  name text not null default 'My brand',
  brand jsonb not null, -- Brand (see src/lib/design-spec.ts)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists brand_boards_owner_idx on public.brand_boards (owner_id);
create index if not exists brand_boards_anon_idx on public.brand_boards (anon_id);
alter table public.brand_boards enable row level security; -- server-only access (service role)
