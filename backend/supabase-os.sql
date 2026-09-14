-- Enebras Mapa — Fase A: Ordens de Serviço (roda DEPOIS do supabase-auth.sql)
-- Dashboard > SQL Editor > New query > cola tudo > Run.

create table if not exists tasks (
  id bigint generated always as identity primary key,
  code text unique not null,
  title text not null,
  type text not null default 'corretiva',
  status text not null default 'aberta',
  priority text not null default 'normal',
  client_name text not null,
  address text,
  city text,
  state text,
  lat double precision,
  lng double precision,
  phone text,
  tech_email text,
  scheduled_date date,
  notes text,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists tasks_tech_idx on tasks(tech_email);
create index if not exists tasks_sched_idx on tasks(scheduled_date);
create index if not exists tasks_status_idx on tasks(status);

-- Rota passa a carregar as OSs que a originaram
alter table routes add column if not exists task_ids jsonb;

-- RLS (permissivo na fase de teste — travar antes da produção)
alter table tasks enable row level security;

drop policy if exists "teste: ler tasks" on tasks;
drop policy if exists "teste: inserir tasks" on tasks;
drop policy if exists "teste: atualizar tasks" on tasks;

create policy "teste: ler tasks" on tasks for select to authenticated using (true);
create policy "teste: inserir tasks" on tasks for insert to authenticated with check (true);
create policy "teste: atualizar tasks" on tasks for update to authenticated using (true) with check (true);
