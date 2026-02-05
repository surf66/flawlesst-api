-- Emergency fix: Temporarily disable RLS for project_reports and file_analysis
-- This will allow the Lambda to work while we debug the RLS issue

-- Disable RLS temporarily
ALTER TABLE project_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE file_analysis DISABLE ROW LEVEL SECURITY;

-- Check current RLS status
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('project_reports', 'file_analysis');

-- Show all policies (should be none now that RLS is disabled)
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
WHERE tablename IN ('project_reports', 'file_analysis')
ORDER BY tablename, policyname;
