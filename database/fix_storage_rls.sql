-- Fix storage bucket RLS issues
-- The problem is likely with storage.objects RLS, not accessibility_scans table

-- Check if RLS is enabled on storage.objects
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'objects' AND schemaname = 'storage';

-- If RLS is enabled on storage.objects, disable it temporarily
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;

-- Test the scan again

-- If that works, re-enable with proper policies
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop all existing storage policies
DROP POLICY IF EXISTS "Service role storage access" ON storage.objects;
DROP POLICY IF EXISTS "Public read screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Allow service role full access to screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to screenshots" ON storage.objects;

-- Create the simplest possible policy
CREATE POLICY "Allow all storage operations" ON storage.objects
    FOR ALL USING (true);

-- Refresh schema cache
NOTIFY pgrst;
