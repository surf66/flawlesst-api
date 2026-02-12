-- PageSpeed Insights Scans Table
CREATE TABLE IF NOT EXISTS pagespeed_scans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    target_url TEXT NOT NULL,
    scan_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending', 'running', 'completed', 'failed')),
    
    -- Core Web Vitals
    performance_score INTEGER,
    first_contentful_paint INTEGER, -- in milliseconds
    largest_contentful_paint INTEGER, -- in milliseconds
    first_input_delay INTEGER, -- in milliseconds
    cumulative_layout_shift DECIMAL(5,3),
    
    -- Other metrics
    seo_score INTEGER,
    accessibility_score INTEGER,
    best_practices_score INTEGER,
    
    -- Full PageSpeed response
    full_response JSONB NOT NULL DEFAULT '{}',
    
    -- Metadata
    strategy VARCHAR(10) NOT NULL DEFAULT 'desktop' CHECK (strategy IN ('desktop', 'mobile')),
    error_message TEXT,
    scan_duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for pagespeed_scans
CREATE INDEX IF NOT EXISTS idx_pagespeed_scans_customer_id ON pagespeed_scans(customer_id);
CREATE INDEX IF NOT EXISTS idx_pagespeed_scans_status ON pagespeed_scans(scan_status);
CREATE INDEX IF NOT EXISTS idx_pagespeed_scans_created_at ON pagespeed_scans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pagespeed_scans_updated_at ON pagespeed_scans(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pagespeed_scans_target_url ON pagespeed_scans(target_url);
CREATE INDEX IF NOT EXISTS idx_pagespeed_scans_performance_score ON pagespeed_scans(performance_score);
CREATE INDEX IF NOT EXISTS idx_pagespeed_scans_strategy ON pagespeed_scans(strategy);

-- Row Level Security for pagespeed_scans
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'pagespeed_scans' AND rowsecurity = true) THEN
        ALTER TABLE pagespeed_scans ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Drop policies if they exist, then recreate them
DROP POLICY IF EXISTS "Users can view their pagespeed scans" ON pagespeed_scans;
DROP POLICY IF EXISTS "Users can insert their pagespeed scans" ON pagespeed_scans;
DROP POLICY IF EXISTS "Service key can bypass RLS for pagespeed_scans" ON pagespeed_scans;

-- RLS Policies for pagespeed_scans
CREATE POLICY "Users can view their pagespeed scans" ON pagespeed_scans
    FOR SELECT USING (customer_id = auth.uid());

CREATE POLICY "Users can insert their pagespeed scans" ON pagespeed_scans
    FOR INSERT WITH CHECK (customer_id = auth.uid());

-- Allow service key to bypass RLS for insertions (for Lambda functions)
CREATE POLICY "Service key can bypass RLS for pagespeed_scans" ON pagespeed_scans
    FOR ALL USING (auth.role() = 'service_role');

-- Add updated_at trigger
DROP TRIGGER IF EXISTS update_pagespeed_scans_updated_at ON pagespeed_scans;
CREATE TRIGGER update_pagespeed_scans_updated_at 
    BEFORE UPDATE ON pagespeed_scans 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View for PageSpeed analytics and trends
CREATE OR REPLACE VIEW pagespeed_summary AS
SELECT 
    ps.id as scan_id,
    ps.customer_id,
    ps.target_url,
    ps.performance_score,
    ps.seo_score,
    ps.accessibility_score,
    ps.best_practices_score,
    ps.first_contentful_paint,
    ps.largest_contentful_paint,
    ps.first_input_delay,
    ps.cumulative_layout_shift,
    ps.strategy,
    ps.scan_status,
    ps.created_at as scan_date,
    ps.completed_at,
    EXTRACT(EPOCH FROM (ps.completed_at - ps.created_at)) as scan_duration_seconds
FROM pagespeed_scans ps
ORDER BY ps.created_at DESC;

-- Function to get PageSpeed trends for a URL
CREATE OR REPLACE FUNCTION get_pagespeed_trends(
    customer_uuid UUID,
    url TEXT,
    days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
    scan_date TIMESTAMP WITH TIME ZONE,
    performance_score INTEGER,
    first_contentful_paint INTEGER,
    largest_contentful_paint INTEGER,
    first_input_delay INTEGER,
    cumulative_layout_shift DECIMAL,
    strategy VARCHAR(10)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ps.created_at,
        ps.performance_score,
        ps.first_contentful_paint,
        ps.largest_contentful_paint,
        ps.first_input_delay,
        ps.cumulative_layout_shift,
        ps.strategy
    FROM pagespeed_scans ps
    WHERE ps.customer_id = customer_uuid
    AND ps.target_url = url
    AND ps.scan_status = 'completed'
    AND ps.created_at >= NOW() - INTERVAL '1 day' * days_back
    ORDER BY ps.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to get latest PageSpeed scores for all customer URLs
CREATE OR REPLACE FUNCTION get_latest_pagespeed_scores(customer_uuid UUID)
RETURNS TABLE (
    target_url TEXT,
    latest_performance_score INTEGER,
    latest_seo_score INTEGER,
    latest_accessibility_score INTEGER,
    latest_best_practices_score INTEGER,
    last_scan_date TIMESTAMP WITH TIME ZONE,
    strategy VARCHAR(10)
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (ps.target_url, ps.strategy)
        ps.target_url,
        ps.performance_score,
        ps.seo_score,
        ps.accessibility_score,
        ps.best_practices_score,
        ps.created_at,
        ps.strategy
    FROM pagespeed_scans ps
    WHERE ps.customer_id = customer_uuid
    AND ps.scan_status = 'completed'
    ORDER BY ps.target_url, ps.strategy, ps.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get performance statistics
CREATE OR REPLACE FUNCTION get_pagespeed_statistics(
    customer_uuid UUID,
    url TEXT DEFAULT NULL,
    days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
    avg_performance_score DECIMAL,
    avg_fcp INTEGER,
    avg_lcp INTEGER,
    avg_fid INTEGER,
    avg_cls DECIMAL,
    total_scans BIGINT,
    performance_trend VARCHAR(20) -- 'improving', 'declining', 'stable'
) AS $$
BEGIN
    RETURN QUERY
    WITH recent_scans AS (
        SELECT 
            ps.performance_score,
            ps.first_contentful_paint,
            ps.largest_contentful_paint,
            ps.first_input_delay,
            ps.cumulative_layout_shift,
            ps.created_at
        FROM pagespeed_scans ps
        WHERE ps.customer_id = customer_uuid
        AND ps.scan_status = 'completed'
        AND ps.created_at >= NOW() - INTERVAL '1 day' * days_back
        AND (url IS NULL OR ps.target_url = url)
    ),
    scan_trend AS (
        SELECT 
            AVG(performance_score) as avg_score,
            CASE 
                WHEN COUNT(*) >= 2 THEN (
                    SELECT CASE 
                        WHEN AVG(performance_score) > (
                            SELECT AVG(performance_score) 
                            FROM recent_scans 
                            WHERE created_at < NOW() - INTERVAL '1 day' * (days_back / 2)
                        ) THEN 'improving'
                        WHEN AVG(performance_score) < (
                            SELECT AVG(performance_score) 
                            FROM recent_scans 
                            WHERE created_at < NOW() - INTERVAL '1 day' * (days_back / 2)
                        ) THEN 'declining'
                        ELSE 'stable'
                    END
                )
                ELSE 'stable'
            END as trend
        FROM recent_scans
    )
    SELECT 
        ROUND(AVG(rs.performance_score), 1),
        ROUND(AVG(rs.first_contentful_paint))::INTEGER,
        ROUND(AVG(rs.largest_contentful_paint))::INTEGER,
        ROUND(AVG(rs.first_input_delay))::INTEGER,
        ROUND(AVG(rs.cumulative_layout_shift), 3),
        COUNT(*)::BIGINT,
        COALESCE(st.trend, 'stable')
    FROM recent_scans rs
    CROSS JOIN scan_trend st;
END;
$$ LANGUAGE plpgsql;
