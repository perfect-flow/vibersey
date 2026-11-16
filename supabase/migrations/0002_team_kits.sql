-- Team kits: extra colorways (away, alternate...) of a team's locked design.
-- Each kit is its own locked design row that differs from the team design only
-- in its colors, so the same roster can order home and away jerseys.
create table if not exists public.team_kits (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  design_id uuid not null references public.designs(id),
  label text not null,
  created_at timestamptz not null default now()
);
create index if not exists team_kits_team_id_idx on public.team_kits (team_id);
alter table public.team_kits enable row level security; -- server-only access (service role)
