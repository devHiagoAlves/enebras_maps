-- Enebras Mapa — backend MVP (Supabase, plano free)
-- Como aplicar: Supabase Dashboard > SQL Editor > New query > cola tudo > Run.
-- Tabelas: routes (1 rota por técnico/dia) + checkins (check-in/out por parada).

create table if not exists routes (
  code text primary key,
  tech text not null,
  route_date text not null,
  stops jsonb not null,
  created_at timestamptz default now()
);

create table if not exists checkins (
  id bigint generated always as identity primary key,
  route_code text not null references routes(code) on delete cascade,
  stop_index int not null,
  client_name text not null,
  kind text not null check (kind in ('checkin', 'checkout', 'note')),
  status text,
  note text,
  lat double precision,
  lng double precision,
  created_at timestamptz default now()
);

create index if not exists checkins_route_idx on checkins(route_code);

-- RLS ligado com políticas permissivas de MVP (qualquer um com o link
-- lê/escreve SÓ via anon key). Antes da produção, travar por usuário.
alter table routes enable row level security;
alter table checkins enable row level security;

drop policy if exists "mvp read routes" on routes;
drop policy if exists "mvp insert routes" on routes;
drop policy if exists "mvp read checkins" on checkins;
drop policy if exists "mvp insert checkins" on checkins;
drop policy if exists "mvp update checkins" on checkins;

create policy "mvp read routes" on routes for select using (true);
create policy "mvp insert routes" on routes for insert with check (true);
create policy "mvp read checkins" on checkins for select using (true);
create policy "mvp insert checkins" on checkins for insert with check (true);
create policy "mvp update checkins" on checkins for update using (true) with check (true);

-- Acesso da Data API (anon/authenticated) + RLS já protege as linhas
grant select, insert, update on routes to anon, authenticated;
grant select, insert, update on checkins to anon, authenticated;
