-- Check if the screenshots bucket exists and create it if needed
-- Also check storage permissions

-- Check existing buckets
SELECT * FROM storage.buckets WHERE name = 'screenshots';

-- If the bucket doesn't exist, you need to create it via:
-- 1. Supabase Dashboard -> Storage -> New bucket
-- 2. Or via SQL (if you have permissions):
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('screenshots', 'screenshots', true, 5242880, ARRAY['image/png'])
ON CONFLICT (id) DO NOTHING;

-- Check current RLS policies on storage.objects
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'objects' AND schemaname = 'storage';

-- Try a different approach - create a more specific policy
-- This might work better than trying to disable RLS

-- Drop existing storage policies
DROP POLICY IF EXISTS "Service role storage access" ON storage.objects;
DROP POLICY IF EXISTS "Public read screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Allow service role full access to screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to screenshots" ON storage.objects;

-- Create policy specifically for service role
CREATE POLICY "Service role can manage screenshots" ON storage.objects
    FOR ALL USING (bucket_id = 'screenshots' AND auth.role() = 'service_role');

-- Refresh schema cache
NOTIFY pgrst;
