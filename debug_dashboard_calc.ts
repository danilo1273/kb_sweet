
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load env 
const envPath = path.resolve(__dirname, '.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

for (const k in envConfig) {
    process.env[k] = envConfig[k];
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function debugDashboard() {
    console.log('Fetching products...');
    const { data: products, error } = await supabase
        .from('products')
        .select('*, product_stocks(quantity, location_id)');

    if (error) {
        console.error('Error:', error);
        return;
    }

    let totalStock = 0;
    let totalValue = 0;
    const details = [];

    products.forEach((p: any) => {
        // Calculate total stock for this product across all locations
        const dbStock = p.product_stocks?.reduce((sAcc: number, s: any) => sAcc + (Number(s.quantity) || 0), 0) || 0;
        // Fallback or specific logic
        const stock = dbStock > 0 ? dbStock : (Number(p.stock_quantity) || 0);

        const price = Number(p.price) || 0;
        const value = stock * price;

        totalStock += stock;
        totalValue += value;

        if (value > 0) {
            details.push({
                name: p.name,
                stock_db: dbStock,
                stock_legacy: p.stock_quantity,
                used_stock: stock,
                price: price,
                total_value: value
            });
        }
    });

    // Sort by value desc
    details.sort((a, b) => b.total_value - a.total_value);

    console.log('--- DASHBOARD CALCULATION DEBUG ---');
    console.log(`Total Finished Stock (Count): ${totalStock}`);
    console.log(`Total Projected Value (R$): ${totalValue.toFixed(2)}`);
    console.log('\n--- TOP 10 ITEMS BY VALUE ---');
    details.slice(0, 10).forEach(d => {
        console.log(`[${d.name}] Stock: ${d.used_stock} (DB: ${d.stock_db}, Leg: ${d.stock_legacy}) | Price: ${d.price} | Total: ${d.total_value.toFixed(2)}`);
    });
}

debugDashboard();
