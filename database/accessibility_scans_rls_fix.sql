-- Fix RLS policies for accessibility_scans table only
-- This is a focused fix for the immediate issue

-- Drop existing accessibility scans policies
DROP POLICY IF EXISTS "Users can view their accessibility scans" ON accessibility_scans;
DROP POLICY IF EXISTS "Users can insert their accessibility scans" ON accessibility_scans;
DROP POLICY IF EXISTS "Service key can bypass RLS for accessibility_scans" ON accessibility_scans;

-- Create service role policy first (highest priority)
CREATE POLICY "Service role full access to accessibility_scans" ON accessibility_scans
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Then create user policies
CREATE POLICY "Users can view their accessibility scans" ON accessibility_scans
    FOR SELECT USING (customer_id = auth.uid());

CREATE POLICY "Users can insert their accessibility scans" ON accessibility_scans
    FOR INSERT WITH CHECK (customer_id = auth.uid());

-- Verify the policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'accessibility_scans'
ORDER BY policyname;
