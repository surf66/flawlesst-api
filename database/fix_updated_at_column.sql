-- Fix for accessibility_scans updated_at column issue
-- This script ensures the updated_at column exists and refreshes the schema cache

-- First, ensure the column exists (it should from the schema)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accessibility_scans' AND column_name = 'updated_at') THEN
        ALTER TABLE accessibility_scans ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_accessibility_scans_updated_at ON accessibility_scans;

-- Create the trigger
CREATE TRIGGER update_accessibility_scans_updated_at 
    BEFORE UPDATE ON accessibility_scans 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Refresh schema cache (PostgreSQL equivalent)
NOTIFY pgrst;  -- This signals PostgREST to reload its schema
