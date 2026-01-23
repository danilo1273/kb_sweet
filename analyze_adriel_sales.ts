
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

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jpbjutncbbmprvqybdmn.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('--- Buscando usuário Adriel ---');
    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .ilike('full_name', '%Adriel%')
        .limit(1);

    if (profileError) {
        console.error('Erro ao buscar perfil:', profileError);
        return;
    }

    if (!profiles || profiles.length === 0) {
        console.log('Usuário Adriel não encontrado.');
        return;
    }

    const adriel = profiles[0];
    console.log(`Encontrado: ${adriel.full_name} (${adriel.id})`);

    console.log('\n--- Buscando últimas 5 vendas ---');
    const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('id, created_at, total, status')
        .eq('user_id', adriel.id)
        .order('created_at', { ascending: false })
        .limit(5);

    if (salesError) {
        console.error('Erro ao buscar vendas:', salesError);
        return;
    }

    for (const sale of sales) {
        console.log(`\nVenda: ${sale.id} | Data: ${new Date(sale.created_at).toLocaleString()} | Total: ${sale.total} | Status: ${sale.status}`);

        const { data: items, error: itemsError } = await supabase
            .from('sale_items')
            .select(`
                id, quantity, unit_price, product_id,
                products (name, unit)
            `)
            .eq('sale_id', sale.id);

        if (itemsError) {
            console.error('Erro ao buscar itens da venda:', itemsError);
            continue;
        }

        for (const item of items) {
            console.log(`   - Produto: ${item.products.name} | Qtd Vendida: ${item.quantity} ${item.products.unit}`);

            // Check current stock for this product
            // Accessing product_stocks table
            const { data: stocks, error: stockError } = await supabase
                .from('product_stocks')
                .select('quantity, location_id, location:stock_locations(name)')
                .eq('product_id', item.product_id);

            if (stockError) {
                console.error('     Erro ao buscar estoque:', stockError);
            } else {
                stocks.forEach(stock => {
                    console.log(`     -> Estoque Atual em ${stock.location?.name}: ${stock.quantity}`);
                    if (stock.quantity < 0) {
                        console.log(`        ⚠️ ALERTA: ESTOQUE NEGATIVO DETECTADO!`);
                    }
                });
            }
        }
    }
}

main();
