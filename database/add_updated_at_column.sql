-- Add missing updated_at column to accessibility_scans table
ALTER TABLE accessibility_scans ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create an index for the updated_at column
CREATE INDEX IF NOT EXISTS idx_accessibility_scans_updated_at ON accessibility_scans(updated_at DESC);

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'accessibility_scans' 
AND table_schema = 'public'
ORDER BY ordinal_position;
