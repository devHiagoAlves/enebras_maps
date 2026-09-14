-- Enebras Mapa — Perfil + fotos + ativação (roda DEPOIS do supabase-os.sql)
-- Dashboard > SQL Editor > New query > cola tudo > Run.

alter table profiles add column if not exists photo_url text;
alter table profiles add column if not exists active boolean not null default true;

-- Bucket público de avatares
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Leitura pública dos avatares
drop policy if exists "avatars leitura publica" on storage.objects;
create policy "avatars leitura publica" on storage.objects
  for select to anon, authenticated using (bucket_id = 'avatars');

-- Cada login gerencia só a própria pasta (avatars/<uid>/...)
drop policy if exists "avatars upload proprio" on storage.objects;
create policy "avatars upload proprio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "avatars atualiza proprio" on storage.objects;
create policy "avatars atualiza proprio" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "avatars apaga proprio" on storage.objects;
create policy "avatars apaga proprio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
