-- Flawlesst API Database Schema
-- Project Analysis and Reporting System

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table (assuming this exists, adding for completeness)
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- Foreign key to users table (adjust based on your auth system)
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add user_id column if it doesn't exist (for existing projects table)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'user_id') THEN
        ALTER TABLE projects ADD COLUMN user_id UUID NOT NULL DEFAULT uuid_generate_v4();
    END IF;
END $$;

-- Main project reports table
CREATE TABLE IF NOT EXISTS project_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
    summary TEXT NOT NULL,
    total_files INTEGER NOT NULL DEFAULT 0,
    files_with_tests INTEGER NOT NULL DEFAULT 0,
    average_score DECIMAL(3,1) NOT NULL CHECK (average_score >= 0 AND average_score <= 10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add check constraints only if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_reports_score_check') THEN
        ALTER TABLE project_reports ADD CONSTRAINT project_reports_score_check CHECK (overall_score >= 0 AND overall_score <= 100);
    END IF;
END $$;

-- Individual file analysis results
CREATE TABLE IF NOT EXISTS file_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES project_reports(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 10),
    has_tests BOOLEAN NOT NULL DEFAULT FALSE,
    test_type VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (test_type IN ('unit', 'integration', 'e2e', 'none')),
    suggestions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add check constraints only if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'file_analysis_score_check') THEN
        ALTER TABLE file_analysis ADD CONSTRAINT file_analysis_score_check CHECK (score >= 0 AND score <= 10);
    END IF;
END $$;

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_project_reports_project_id ON project_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_project_reports_created_at ON project_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_analysis_report_id ON file_analysis(report_id);
CREATE INDEX IF NOT EXISTS idx_file_analysis_score ON file_analysis(score);
CREATE INDEX IF NOT EXISTS idx_file_analysis_has_tests ON file_analysis(has_tests);

-- Row Level Security (RLS) for multi-tenant support
DO $$ 
BEGIN
    -- Enable RLS if not already enabled
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'project_reports' AND rowsecurity = true) THEN
        ALTER TABLE project_reports ENABLE ROW LEVEL SECURITY;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'file_analysis' AND rowsecurity = true) THEN
        ALTER TABLE file_analysis ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- RLS Policies (these would need to be adapted based on your auth system)
-- Drop policies if they exist, then recreate them
DROP POLICY IF EXISTS "Users can view reports for their projects" ON project_reports;
DROP POLICY IF EXISTS "Users can insert reports for their projects" ON project_reports;
DROP POLICY IF EXISTS "Service key can bypass RLS for project_reports" ON project_reports;
DROP POLICY IF EXISTS "Users can view file analysis for their project reports" ON file_analysis;
DROP POLICY IF EXISTS "Users can insert file analysis for their project reports" ON file_analysis;
DROP POLICY IF EXISTS "Service key can bypass RLS for file_analysis" ON file_analysis;

-- Example policies - adjust based on your actual user/project relationship
-- NOTE: These policies assume you have a user_id column in projects table
-- If your auth system is different, modify these accordingly

-- For Supabase Auth with auth.uid() matching user_id in projects table:
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

-- Allow service key to bypass RLS for insertions (for Lambda functions)
CREATE POLICY "Service key can bypass RLS for project_reports" ON project_reports
    FOR ALL USING (auth.role() = 'service_role');

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

-- Allow service key to bypass RLS for insertions (for Lambda functions)
CREATE POLICY "Service key can bypass RLS for file_analysis" ON file_analysis
    FOR ALL USING (auth.role() = 'service_role');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop trigger if exists, then create it
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at 
    BEFORE UPDATE ON projects 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View for easy reporting analytics
CREATE OR REPLACE VIEW project_analysis_summary AS
SELECT 
    p.id as project_id,
    p.name as project_name,
    pr.id as report_id,
    pr.overall_score,
    pr.total_files,
    pr.files_with_tests,
    ROUND((pr.files_with_tests::DECIMAL / NULLIF(pr.total_files, 0)) * 100, 2) as test_coverage_percentage,
    pr.average_score,
    pr.created_at as analysis_date,
    COUNT(fa.id) as analyzed_files_count,
    ROUND(AVG(fa.score), 2) as avg_file_score
FROM projects p
LEFT JOIN project_reports pr ON p.id = pr.project_id
LEFT JOIN file_analysis fa ON pr.id = fa.report_id
GROUP BY p.id, p.name, pr.id, pr.overall_score, pr.total_files, pr.files_with_tests, pr.average_score, pr.created_at
ORDER BY pr.created_at DESC;

-- Function to get project insights
CREATE OR REPLACE FUNCTION get_project_insights(project_uuid UUID)
RETURNS TABLE (
    report_id UUID,
    overall_score INTEGER,
    test_coverage_percentage DECIMAL,
    avg_file_score DECIMAL,
    high_score_files BIGINT,
    low_score_files BIGINT,
    most_common_issues JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pr.id,
        pr.overall_score,
        ROUND((pr.files_with_tests::DECIMAL / NULLIF(pr.total_files, 0)) * 100, 2),
        pr.average_score,
        COUNT(CASE WHEN fa.score >= 8 THEN 1 END)::BIGINT,
        COUNT(CASE WHEN fa.score <= 3 THEN 1 END)::BIGINT,
        jsonb_agg(DISTINCT fa.suggestions) as most_common_issues
    FROM project_reports pr
    LEFT JOIN file_analysis fa ON pr.id = fa.report_id
    WHERE pr.project_id = project_uuid
    GROUP BY pr.id, pr.overall_score, pr.files_with_tests, pr.total_files, pr.average_score
    ORDER BY pr.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Accessibility Scans Table
CREATE TABLE IF NOT EXISTS accessibility_scans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    target_url TEXT NOT NULL,
    scan_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending', 'running', 'completed', 'failed')),
    violations JSONB NOT NULL DEFAULT '[]',
    violation_count INTEGER NOT NULL DEFAULT 0,
    scan_duration_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for accessibility_scans
CREATE INDEX IF NOT EXISTS idx_accessibility_scans_customer_id ON accessibility_scans(customer_id);
CREATE INDEX IF NOT EXISTS idx_accessibility_scans_status ON accessibility_scans(scan_status);
CREATE INDEX IF NOT EXISTS idx_accessibility_scans_created_at ON accessibility_scans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accessibility_scans_target_url ON accessibility_scans(target_url);

-- Row Level Security for accessibility_scans
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'accessibility_scans' AND rowsecurity = true) THEN
        ALTER TABLE accessibility_scans ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Drop policies if they exist, then recreate them
DROP POLICY IF EXISTS "Users can view their accessibility scans" ON accessibility_scans;
DROP POLICY IF EXISTS "Users can insert their accessibility scans" ON accessibility_scans;
DROP POLICY IF EXISTS "Service key can bypass RLS for accessibility_scans" ON accessibility_scans;

-- RLS Policies for accessibility_scans
CREATE POLICY "Users can view their accessibility scans" ON accessibility_scans
    FOR SELECT USING (customer_id = auth.uid());

CREATE POLICY "Users can insert their accessibility scans" ON accessibility_scans
    FOR INSERT WITH CHECK (customer_id = auth.uid());

-- Allow service key to bypass RLS for insertions (for Lambda functions)
CREATE POLICY "Service key can bypass RLS for accessibility_scans" ON accessibility_scans
    FOR ALL USING (auth.role() = 'service_role');
