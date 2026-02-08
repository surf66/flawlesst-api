const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing Supabase configuration');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function applyRlsFix() {
    try {
        console.log('Reading SQL file...');
        const sql = fs.readFileSync('./database/fix_rls.sql', 'utf8');
        
        console.log('Applying RLS fix...');
        const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
        
        if (error) {
            console.error('Error applying RLS fix:', error);
            process.exit(1);
        }
        
        console.log('RLS fix applied successfully!');
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

applyRlsFix();
