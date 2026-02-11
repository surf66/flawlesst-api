-- Add name column to accessibility_scans table
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accessibility_scans' AND column_name = 'name') THEN
        ALTER TABLE accessibility_scans ADD COLUMN name VARCHAR(255);
    END IF;
END $$;

-- Add index for the name column
CREATE INDEX IF NOT EXISTS idx_accessibility_scans_name ON accessibility_scans(name);
