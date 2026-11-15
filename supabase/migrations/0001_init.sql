-- Vibersey initial schema
create extension if not exists "pgcrypto";

-- Users -------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  generation_count int not null default 0,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Anonymous visitors: 5 free generations before signup ----------------------
create table public.anon_sessions (
  id uuid primary key,
  ip text,
  generation_count int not null default 0,
  claimed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Printful catalog cache (filled by /api/admin/sync-catalog) ----------------
create table public.products (
  key text primary key,          -- ProductKey in src/lib/catalog.ts
  sport text not null check (sport in ('baseball','basketball','football','hockey','soccer')),
  printful_product_id int not null,
  title text not null,
  audience text not null default 'adult' check (audience in ('adult','youth')),
  -- [{ id, size, color, cost }]
  variants jsonb not null default '[]',
  -- { placement: { width, height, dpi } }
  printfiles jsonb not null default '{}',
  mockup_image text,
  synced_at timestamptz
);

-- Designs -----------------------------------------------------------------
create table public.designs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  anon_id uuid,               -- set while an anonymous visitor owns the draft
  sport text not null,
  title text not null default 'Untitled jersey',
  spec jsonb not null,        -- DesignSpec (see src/lib/design-spec.ts)
  preview_url text,
  locked boolean not null default false, -- true once used as a team template
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.designs (owner_id);
create index on public.designs (anon_id);

create table public.design_messages (
  id bigserial primary key,
  design_id uuid not null references public.designs(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index on public.design_messages (design_id, id);

-- Teams -------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  design_id uuid not null references public.designs(id),
  name text not null,
  share_slug text unique not null,
  share_enabled boolean not null default true,
  -- who pays when members order via the share link: 'member' or 'manager'
  payment_mode text not null default 'member' check (payment_mode in ('member','manager')),
  created_at timestamptz not null default now()
);

create table public.roster_entries (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_name text not null default '',
  number text not null default '',
  size text not null,
  quantity int not null default 1 check (quantity > 0),
  email text,
  source text not null default 'manual' check (source in ('manual','csv','link')),
  order_id uuid,
  created_at timestamptz not null default now()
);
create index on public.roster_entries (team_id);

-- Orders ------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  team_id uuid references public.teams(id),
  email text,
  status text not null default 'pending'
    check (status in ('pending','paid','submitted','fulfilled','shipped','canceled','failed')),
  -- [{ design_id, sport, product_key, variant_id, size, name, number, quantity, unit_price_cents, unit_cost_cents, files:[{type,url}] }]
  items jsonb not null,
  subtotal_cents int not null,
  shipping_cents int not null default 0,
  stripe_session_id text unique,
  printful_order_id bigint,
  shipping_address jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS ---------------------------------------------------------------------
-- All writes go through server routes using the service role; RLS here only
-- governs direct reads from the browser with the anon key.
alter table public.profiles enable row level security;
alter table public.anon_sessions enable row level security;
alter table public.products enable row level security;
alter table public.designs enable row level security;
alter table public.design_messages enable row level security;
alter table public.teams enable row level security;
alter table public.roster_entries enable row level security;
alter table public.orders enable row level security;

create policy "own profile" on public.profiles for select using (auth.uid() = id);
create policy "catalog is public" on public.products for select using (true);
create policy "own designs" on public.designs for select using (auth.uid() = owner_id);
create policy "own design messages" on public.design_messages for select
  using (exists (select 1 from public.designs d where d.id = design_id and d.owner_id = auth.uid()));
create policy "own teams" on public.teams for select using (auth.uid() = owner_id);
create policy "own roster" on public.roster_entries for select
  using (exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid()));
create policy "own orders" on public.orders for select using (auth.uid() = user_id);

-- Storage -----------------------------------------------------------------
-- artwork: AI artwork and uploaded logos. printfiles: rendered files sent to Printful.
insert into storage.buckets (id, name, public) values ('artwork', 'artwork', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('printfiles', 'printfiles', true) on conflict do nothing;
