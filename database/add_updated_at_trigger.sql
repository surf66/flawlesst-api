-- Add updated_at trigger for accessibility_scans table
-- This fixes the issue where Lambda tries to update updated_at column

-- Drop trigger if exists, then create it
DROP TRIGGER IF EXISTS update_accessibility_scans_updated_at ON accessibility_scans;

CREATE TRIGGER update_accessibility_scans_updated_at 
    BEFORE UPDATE ON accessibility_scans 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
