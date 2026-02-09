-- Comprehensive fix for all RLS issues
-- Fix both storage bucket and accessibility_scans table

-- First, let's disable RLS temporarily to confirm this is the issue
ALTER TABLE accessibility_scans DISABLE ROW LEVEL SECURITY;

-- Test the scan to confirm it works, then re-enable with proper policies

-- Re-enable RLS on accessibility_scans
ALTER TABLE accessibility_scans ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies on accessibility_scans
DROP POLICY IF EXISTS "Service role full access" ON accessibility_scans;
DROP POLICY IF EXISTS "Allow anon insert" ON accessibility_scans;
DROP POLICY IF EXISTS "Enable service role for all operations" ON accessibility_scans;
DROP POLICY IF EXISTS "Enable anon for insert only" ON accessibility_scans;
DROP POLICY IF EXISTS "Enable users to read own scans" ON accessibility_scans;
DROP POLICY IF EXISTS "Allow everything" ON accessibility_scans;

-- Create simple, explicit policies
CREATE POLICY "Service role all operations" ON accessibility_scans
    FOR ALL USING (auth.role() = 'service_role');

-- Fix storage policies
DROP POLICY IF EXISTS "Allow service role full access to screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to screenshots" ON storage.objects;

CREATE POLICY "Service role storage access" ON storage.objects
    FOR ALL USING (bucket_id = 'screenshots' AND auth.role() = 'service_role');

-- Allow public read for screenshots
CREATE POLICY "Public read screenshots" ON storage.objects
    FOR SELECT USING (bucket_id = 'screenshots');

-- Refresh schema cache
NOTIFY pgrst;
