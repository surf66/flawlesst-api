-- Debug script to check what's in the accessibility_scans table
-- Run this to verify the record actually exists and check RLS policies

-- Check if the specific scan record exists
SELECT id, customer_id, target_url, scan_status, created_at, updated_at 
FROM accessibility_scans 
WHERE id = '2d5c6543-7a32-426e-a267-6d0479c260bf';

-- Check all recent records
SELECT id, customer_id, target_url, scan_status, created_at, updated_at 
FROM accessibility_scans 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Check current RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'accessibility_scans';

-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'accessibility_scans';
