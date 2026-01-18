
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual .env parsing
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
    // skip comments
    if (line.trim().startsWith('#')) return;

    // find first equals
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) return;

    const key = line.substring(0, eqIdx).trim();
    let value = line.substring(eqIdx + 1).trim();

    // remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
    }

    env[key] = value;
});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseAnonKey = env['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase variables");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testFetch() {
    console.log("Fetching products...");
    const { data, error } = await supabase.from('products')
        .select(`
                *,
                product_stocks (
                    quantity,
                    average_cost,
                    location_id
                )
            `)
        .order('name');

    if (error) {
        console.error("Error fetching products:", error);
    } else {
        console.log(`Fetched ${data?.length} products.`);
        if (data && data.length > 0) {
            console.log("First product sample:", JSON.stringify(data[0], null, 2));
        }
    }
}

testFetch();
