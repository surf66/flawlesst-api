-- Create function to debug authentication role
CREATE OR REPLACE FUNCTION get_current_role()
RETURNS TEXT AS $$
BEGIN
    RETURN auth.role();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test the function
SELECT get_current_role();
