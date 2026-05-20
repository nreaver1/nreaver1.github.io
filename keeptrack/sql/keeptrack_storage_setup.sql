-- ============================================================
-- Keep Track — Storage Setup
-- Run this once in your Supabase SQL Editor to create the
-- avatars storage bucket with proper access policies.
-- ============================================================

-- Create the avatars bucket (public so avatar URLs work without auth tokens)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2MB limit
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own folder (avatars/<user_id>/*)
create policy "avatars_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to update/replace their own avatar
create policy "avatars_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to delete their own avatar
create policy "avatars_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow anyone (including unauthenticated) to read avatars — needed for public URLs
create policy "avatars_read" on storage.objects
  for select to public
  using (bucket_id = 'avatars');
