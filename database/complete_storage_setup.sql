-- Complete storage setup for screenshots
-- This should be run in order to fix all storage issues

-- Step 1: Create the screenshots bucket (if it doesn't exist)
-- Note: This might fail due to permissions - if so, create via dashboard
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('screenshots', 'screenshots', true, 5242880, ARRAY['image/png', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- Step 2: Remove ALL existing storage policies
DROP POLICY IF EXISTS "Service role can manage screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Service role storage access" ON storage.objects;
DROP POLICY IF EXISTS "Public read screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Allow service role full access to screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to screenshots" ON storage.objects;

-- Step 3: Create the simplest possible policy - allow everything
CREATE POLICY "Allow all on screenshots bucket" ON storage.objects
    FOR ALL USING (bucket_id = 'screenshots');

-- Step 4: Check current policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'objects' AND schemaname = 'storage';

-- Step 5: Refresh schema cache
NOTIFY pgrst;

-- Step 6: Verify bucket exists
SELECT * FROM storage.buckets WHERE name = 'screenshots';
