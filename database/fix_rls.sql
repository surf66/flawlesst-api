-- Fix RLS policies for service role access
-- This script creates explicit policies for service role bypass

-- First, drop all existing policies to start fresh
DROP POLICY IF EXISTS "Users can view reports for their projects" ON project_reports;
DROP POLICY IF EXISTS "Users can insert reports for their projects" ON project_reports;
DROP POLICY IF EXISTS "Service key can bypass RLS for project_reports" ON project_reports;
DROP POLICY IF EXISTS "Users can view file analysis for their project reports" ON file_analysis;
DROP POLICY IF EXISTS "Users can insert file analysis for their project reports" ON file_analysis;
DROP POLICY IF EXISTS "Service key can bypass RLS for file_analysis" ON file_analysis;

-- Create service role policies first (higher priority)
CREATE POLICY "Service role full access to project_reports" ON project_reports
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to file_analysis" ON file_analysis
    FOR ALL USING (auth.role() = 'service_role');

-- Then create user policies
CREATE POLICY "Users can view reports for their projects" ON project_reports
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE id = project_reports.project_id 
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert reports for their projects" ON project_reports
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE id = project_reports.project_id 
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view file analysis for their project reports" ON file_analysis
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM project_reports pr
            JOIN projects p ON p.id = pr.project_id
            WHERE pr.id = file_analysis.report_id 
            AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert file analysis for their project reports" ON file_analysis
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM project_reports pr
            JOIN projects p ON p.id = pr.project_id
            WHERE pr.id = file_analysis.report_id 
            AND p.user_id = auth.uid()
        )
    );

-- Verify policies are created correctly
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
