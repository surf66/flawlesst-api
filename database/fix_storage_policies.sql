-- Fix storage bucket permissions for screenshots
-- This allows the service role to upload screenshots to the storage bucket

-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Allow service role uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;

-- Create policies for the screenshots bucket
CREATE POLICY "Allow service role full access to screenshots" ON storage.objects
    FOR ALL USING (bucket_id = 'screenshots' AND auth.role() = 'service_role');

-- Allow public read access to screenshots
CREATE POLICY "Allow public read access to screenshots" ON storage.objects
    FOR SELECT USING (bucket_id = 'screenshots');

-- Alternative: More restrictive policy if needed
-- CREATE POLICY "Allow service role insert to screenshots" ON storage.objects
--     FOR INSERT WITH CHECK (bucket_id = 'screenshots' AND auth.role() = 'service_role');
-- 
-- CREATE POLICY "Allow service role update screenshots" ON storage.objects
--     FOR UPDATE USING (bucket_id = 'screenshots' AND auth.role() = 'service_role');
-- 
-- CREATE POLICY "Allow service role delete screenshots" ON storage.objects
--     FOR DELETE USING (bucket_id = 'screenshots' AND auth.role() = 'service_role');

-- Refresh schema cache
NOTIFY pgrst;
