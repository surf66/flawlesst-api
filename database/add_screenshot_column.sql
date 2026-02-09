-- Add screenshot_url column to accessibility_scans table
-- This will store the URL to the screenshot taken during the scan

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accessibility_scans' AND column_name = 'screenshot_url') THEN
        ALTER TABLE accessibility_scans ADD COLUMN screenshot_url TEXT;
    END IF;
END $$;

-- Create a storage bucket for screenshots if it doesn't exist
-- Note: This needs to be created via Supabase dashboard or API
-- Bucket name: "screenshots"
-- Make it public so screenshots can be accessed via URL

-- Add comment
COMMENT ON COLUMN accessibility_scans.screenshot_url IS 'URL to the screenshot taken during accessibility scan';
