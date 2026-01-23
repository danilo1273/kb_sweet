
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Try to read .env file for local dev
try {
    const envPath = path.resolve(process.cwd(), '.env');
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
} catch (e) {
    console.log('No .env file found or error reading it');
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('Starting analysis...');

    // 1. Find Adriel
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .ilike('full_name', '%Adriel%')
        .limit(1);

    if (!profiles?.length) {
        console.log('User Adriel not found.');
    } else {
        const adriel = profiles[0];
        console.log(`User: ${adriel.full_name} (${adriel.id})`);

        // 2. Find his sales
        const { data: sales } = await supabase
            .from('sales')
            .select('*')
            .eq('user_id', adriel.id)
            .order('created_at', { ascending: false })
            .limit(5);

        console.log(`Found ${sales?.length} sales for Adriel.`);

        if (sales && sales.length > 0) {
            for (const sale of sales) {
                console.log(`\nSale ID: ${sale.id} | Date: ${new Date(sale.created_at).toLocaleString()}`);

                const { data: items } = await supabase
                    .from('sale_items')
                    .select('*, products(name)')
                    .eq('sale_id', sale.id);

                if (items) {
                    for (const item of items) {
                        console.log(`   Product: ${item.products?.name} | Qty: ${item.quantity}`);

                        // Check stock for this product
                        const { data: stocks } = await supabase
                            .from('product_stocks')
                            .select('*, stock_locations(name)')
                            .eq('product_id', item.product_id);

                        if (stocks) {
                            stocks.forEach(s => {
                                console.log(`      Stock in ${s.stock_locations?.name}: ${s.quantity} (ID: ${s.id})`);
                            });
                        }
                    }
                }
            }
        }
    }

    // 3. Global Negative Stock Check
    console.log('\n--- Checking ALL Negative Stocks ---');
    const { data: negativeStocks } = await supabase
        .from('product_stocks')
        .select('quantity, product_id, location_id, products(name), stock_locations(name)')
        .lt('quantity', 0);

    if (negativeStocks && negativeStocks.length > 0) {
        console.log(`Found ${negativeStocks.length} items with negative stock:`);
        negativeStocks.forEach(s => {
            console.log(`   Product: ${s.products?.name} | Location: ${s.stock_locations?.name} | Qty: ${s.quantity}`);
        });
    } else {
        console.log('No negative stocks found.');
    }
}

main();
