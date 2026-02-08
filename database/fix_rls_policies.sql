-- Fix RLS policies for accessibility_scans to ensure service key can update records
-- This resolves the issue where scanner gets empty array when trying to update

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Users can view their accessibility scans" ON accessibility_scans;
DROP POLICY IF EXISTS "Users can insert their accessibility scans" ON accessibility_scans;
DROP POLICY IF EXISTS "Allow anon role to insert accessibility scans" ON accessibility_scans;
DROP POLICY IF EXISTS "Service key can bypass RLS for accessibility_scans" ON accessibility_scans;

-- Recreate RLS Policies with proper UPDATE permissions
CREATE POLICY "Users can view their accessibility scans" ON accessibility_scans
    FOR SELECT USING (customer_id = auth.uid());

CREATE POLICY "Users can insert their accessibility scans" ON accessibility_scans
    FOR INSERT WITH CHECK (customer_id = auth.uid());

-- Allow anon role to insert accessibility scans (for Lambda functions using anon key)
CREATE POLICY "Allow anon role to insert accessibility scans" ON accessibility_scans
    FOR INSERT WITH CHECK (auth.role() = 'anon');

-- Allow service key to bypass RLS for ALL operations (including UPDATE)
CREATE POLICY "Service key can bypass RLS for accessibility_scans" ON accessibility_scans
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Refresh schema cache
NOTIFY pgrst;
