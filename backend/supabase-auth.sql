-- Enebras Mapa — Auth + perfis (roda DEPOIS do supabase-schema.sql)
-- Dashboard > SQL Editor > New query > cola tudo > Run.
--
-- LOGINS DE TESTE (criar em Authentication > Users > Add user):
--   admin@enebras.teste / Teste123!  → vira adm pelo UPDATE abaixo
--   tec1@enebras.teste  / Teste123!  → técnico
-- Depois de criar os 2 usuários, rode os UPDATEs no final deste arquivo.

-- 1. Perfis (papel de cada login)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text not null default '',
  role text not null default 'tecnico' check (role in ('admin', 'tecnico')),
  equipe text,
  created_at timestamptz default now()
);

-- 2. Todo signup ganha perfil automaticamente (padrão: técnico)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, nome)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Rota passa a saber PARA QUEM ela é (e-mail do técnico)
alter table routes add column if not exists tech_email text;

-- 4. RLS (permissivo na fase de teste — travar antes da produção)
alter table profiles enable row level security;

drop policy if exists "teste: ler perfis" on profiles;
drop policy if exists "teste: atualizar perfis" on profiles;
drop policy if exists "teste: inserir perfis" on profiles;

create policy "teste: ler perfis" on profiles for select to authenticated using (true);
create policy "teste: inserir perfis" on profiles for insert to authenticated with check (true);
create policy "teste: atualizar perfis" on profiles for update to authenticated using (true) with check (true);

-- 5. Promover o adm de teste (RODAR DEPOIS de criar os usuários no Dashboard)
-- update profiles set role = 'admin', nome = 'Hiago (Adm)' where email = 'admin@enebras.teste';
-- update profiles set nome = 'Tecnico 01' where email = 'tec1@enebras.teste';

-- Acesso da Data API (anon/authenticated) + RLS já protege as linhas
grant select, insert, update on profiles to anon, authenticated;
