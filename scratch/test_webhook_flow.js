import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config({ path: 'c:/Users/DANILO/Desktop/KBSWEET/.env' });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

async function run() {
  const profile = {
    id: "1628cbf0-07ac-4f30-9c4a-d5eb501f722b",
    company_id: "e1687e32-cbce-42f0-8957-e0ca7c73679f",
    roles: ["buyer", "seller", "admin", "approver", "financial"]
  };
  const text = "ajustar 2 unidades pipoca mista custo 3,35 cada";

  console.log("1. Starting adjustment test flow with query...");

  try {
    let productsQuery = supabase.from('products').select(`
      id, name, cost,
      product_stocks (quantity, location_id)
    `);
    let ingredientsQuery = supabase.from('ingredients').select(`
      id, name, cost,
      product_stocks (quantity, location_id)
    `);
    let locationsQuery = supabase.from('stock_locations').select('id, name, slug');

    if (profile.company_id) {
      productsQuery = productsQuery.or(`company_id.eq.${profile.company_id},company_id.is.null`);
      ingredientsQuery = ingredientsQuery.or(`company_id.eq.${profile.company_id},company_id.is.null`);
      locationsQuery = locationsQuery.or(`company_id.eq.${profile.company_id},company_id.is.null`);
    }

    const [productsRes, ingredientsRes, locationsRes] = await Promise.all([
      productsQuery,
      ingredientsQuery,
      locationsQuery
    ]);

    if (productsRes.error) console.error("Products error:", productsRes.error);
    if (ingredientsRes.error) console.error("Ingredients error:", ingredientsRes.error);
    if (locationsRes.error) console.error("Locations error:", locationsRes.error);

    const products = productsRes.data || [];
    const ingredients = ingredientsRes.data || [];
    const locations = locationsRes.data || [];

    console.log(`Fetched: ${products.length} products, ${ingredients.length} ingredients, ${locations.length} locations`);

    const items = [
      ...products.map(p => ({ ...p, is_product: true })),
      ...ingredients.map(i => ({ ...i, is_product: false }))
    ];

    const prompt = `Você é o assistente inteligente do KB Sweet. Analise a mensagem de ajuste de estoque enviada pelo usuário (um administrador) e mapeie o item correto, o local de estoque (armazém) correto, a operação (definir valor exato "set", adicionar quantidade "add" ou subtrair quantidade "subtract") e a quantidade.

Mensagem do usuário: "${text}"

Produtos e Ingredientes disponíveis:
${JSON.stringify(items.map(i => ({ id: i.id, name: i.name, is_product: i.is_product })))}

Locais de estoque (Armazéns) disponíveis:
${JSON.stringify(locations || [])}

Instruções importantes de correspondência:
1. Faça correspondência semântica/aproximada. Por exemplo:
   - "pipoca mista" ou "pipoca meio a meio" deve corresponder a "Pipoca Gourmet 150g Meio a Meio".
   - "pipoca cacau" deve corresponder a "Pipoca Gourmet Cacau 450g".
   - Abreviações ou sinônimos devem ser resolvidos para os itens cadastrados acima.
2. Identifique se o usuário especificou um custo unitário (ex: "custo 3,35" ou "valor de custo 3.35"). Se sim, extraia o número em "cost", caso contrário retorne null.

Retorne um JSON seguindo exatamente este formato:
{
  "item_id": "uuid-do-item-encontrado-ou-null",
  "is_product": true,
  "location_id": "uuid-do-local-de-estoque-se-identificado-ou-null",
  "operation": "set" | "add" | "subtract",
  "amount": 10.0,
  "cost": 3.35,
  "reason": "motivo-curto-do-ajuste"
}`;

    console.log("2. Calling Gemini API...");
    const aiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [prompt],
      config: { responseMimeType: 'application/json' }
    });

    console.log("3. Gemini API response received:", aiResponse.text);
    const parsed = JSON.parse(aiResponse.text || '{}');
    console.log("Parsed JSON:", parsed);

    const matchedItem = items.find(i => i.id === parsed.item_id);
    if (!matchedItem) {
      console.log("Item not matched in local items!");
      return;
    }
    console.log("Matched item:", matchedItem.name);

    const locationId = parsed.location_id || locations?.[0]?.id;
    const matchedLocation = locations?.find(l => l.id === locationId);
    console.log("Matched location:", matchedLocation?.name);

  } catch (err) {
    console.error("Failed during test execution:", err);
  }
}

run();
