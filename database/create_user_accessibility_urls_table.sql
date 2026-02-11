-- Create user_accessibility_urls table
CREATE TABLE IF NOT EXISTS user_accessibility_urls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_accessibility_urls_user_id ON user_accessibility_urls(user_id);
CREATE INDEX IF NOT EXISTS idx_user_accessibility_urls_created_at ON user_accessibility_urls(created_at DESC);

-- Enable Row Level Security
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'user_accessibility_urls' AND rowsecurity = true) THEN
        ALTER TABLE user_accessibility_urls ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Drop policies if they exist, then recreate them
DROP POLICY IF EXISTS "Users can view their accessibility URLs" ON user_accessibility_urls;
DROP POLICY IF EXISTS "Users can insert their accessibility URLs" ON user_accessibility_urls;
DROP POLICY IF EXISTS "Users can update their accessibility URLs" ON user_accessibility_urls;
DROP POLICY IF EXISTS "Users can delete their accessibility URLs" ON user_accessibility_urls;
DROP POLICY IF EXISTS "Service key can bypass RLS for user_accessibility_urls" ON user_accessibility_urls;

-- RLS Policies for user_accessibility_urls
CREATE POLICY "Users can view their accessibility URLs" ON user_accessibility_urls
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their accessibility URLs" ON user_accessibility_urls
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their accessibility URLs" ON user_accessibility_urls
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their accessibility URLs" ON user_accessibility_urls
    FOR DELETE USING (user_id = auth.uid());

-- Allow service key to bypass RLS for all operations (for Lambda functions)
CREATE POLICY "Service key can bypass RLS for user_accessibility_urls" ON user_accessibility_urls
    FOR ALL USING (auth.role() = 'service_role');

-- Add trigger for updated_at column
DROP TRIGGER IF EXISTS update_user_accessibility_urls_updated_at ON user_accessibility_urls;
CREATE TRIGGER update_user_accessibility_urls_updated_at 
    BEFORE UPDATE ON user_accessibility_urls 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
