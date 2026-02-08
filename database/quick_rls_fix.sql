-- Quick fix: Allow anon role to insert accessibility scans
-- This allows the Lambda (currently using anon key) to work

CREATE POLICY "Allow anon role to insert accessibility scans" ON accessibility_scans
    FOR INSERT WITH CHECK (auth.role() = 'anon');

-- Verify the policy was created
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies 
WHERE tablename = 'accessibility_scans'
ORDER BY policyname;
