-- ══════════════════════════════════════════════════════════════
--  NEXUS — portraits in Supabase Storage
--  Run in: Supabase Dashboard → SQL Editor, AFTER supabase_auth.sql
--  (the rules use its nexus_can_edit()). Safe to re-run.
--
--  Creates the public "portraits" bucket. party_members.photo holds the
--  file's public URL instead of the image itself (js/nexus-config.js,
--  nexusStorePortrait). Anyone can view a portrait; only signed-in
--  editors in campaign_members can add, replace or remove one.
--  Without sign-in (legacy installs) the pages keep storing data: URLs.
-- ══════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portraits', 'portraits', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage checks SELECT before a delete, so the bucket is readable too
-- (it is public anyway).
drop policy if exists "nexus portraits read"   on storage.objects;
drop policy if exists "nexus portraits add"    on storage.objects;
drop policy if exists "nexus portraits change" on storage.objects;
drop policy if exists "nexus portraits remove" on storage.objects;

create policy "nexus portraits read" on storage.objects
  for select using (bucket_id = 'portraits');

create policy "nexus portraits add" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'portraits' and public.nexus_can_edit());

create policy "nexus portraits change" on storage.objects
  for update to authenticated
  using (bucket_id = 'portraits' and public.nexus_can_edit())
  with check (bucket_id = 'portraits' and public.nexus_can_edit());

create policy "nexus portraits remove" on storage.objects
  for delete to authenticated
  using (bucket_id = 'portraits' and public.nexus_can_edit());
