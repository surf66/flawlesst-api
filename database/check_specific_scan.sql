-- Check if the specific scan record exists
SELECT id, customer_id, target_url, scan_status, created_at, updated_at 
FROM accessibility_scans 
WHERE id = 'b144ce90-0db0-4b11-b53f-ff656c466ffc';
