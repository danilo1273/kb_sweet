import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';


async function sendTelegram(method: string, payload: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return response.json();
}

async function sendMessage(chatId: string | number, text: string, replyMarkup?: any, parseMode: string = 'Markdown') {
  const payload: any = {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup
  };
  if (parseMode) {
    payload.parse_mode = parseMode;
  }
  return sendTelegram('sendMessage', payload);
}

async function generateContentREST(prompt: string, model: string = 'gemini-2.5-flash', fileData?: { mimeType: string, data: string }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not defined.');
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const parts: any[] = [];
  if (fileData) {
    parts.push({
      inlineData: {
        mimeType: fileData.mimeType,
        data: fileData.data
      }
    });
  }
  parts.push({ text: prompt });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seconds timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: 'application/json' }
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini REST API failed with status ${response.status}: ${errText}`);
    }
    
    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      throw new Error('Empty response from Gemini API');
    }
    return textResponse;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Tempo limite de 5s excedido para o modelo ${model}`);
    }
    throw err;
  }
}

async function generateContentWithRetry(prompt: string, fileData?: { mimeType: string, data: string }) {
  let lastError: any;
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  
  for (const model of models) {
    try {
      const text = await generateContentREST(prompt, model, fileData);
      return { text };
    } catch (error: any) {
      lastError = error;
      console.warn(`Gemini model ${model} failed: ${error.message || error}`);
    }
  }
  throw lastError;
}

// ─── Local fallback parser (no AI needed) ──────────────────────────────────
// Parses stock adjustment messages like:
//   "subir 2 unidades pipoca mista estoque danilo custo 3,35"
//   "ajustar bolo de pote para 5 unidades no armazem adriel"
//   "adicionei 10 trufas de maracujá no estoque danilo"
function parseStockAdjustmentLocally(
  text: string,
  items: Array<{ id: string; name: string; is_product: boolean }>,
  locations: Array<{ id: string; name: string; slug: string }>
): { item_id: string | null; is_product: boolean; location_id: string | null; operation: string; amount: number; cost: number | null; reason: string } {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Detect operation
  let operation = 'add';
  if (/\b(definir|ajustar para|setar|set|para\s+\d)\b/.test(t)) operation = 'set';
  else if (/\b(remover|retirar|subtrair|baixar|saida|vendi|venda|perdi|consumo|consumido|usei)\b/.test(t)) operation = 'subtract';

  // Extract quantity
  const qtyMatch = t.match(/(\d+[.,]?\d*)\s*(unidades?|un\b|pcs?|kg|g\b)/);
  const amount = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : (() => {
    const numMatch = t.match(/\b(\d+[.,]?\d*)\b/);
    return numMatch ? parseFloat(numMatch[1].replace(',', '.')) : 0;
  })();

  // Extract cost
  let cost: number | null = null;
  const costMatch = t.match(/(?:custo|valor\s*de\s*custo|preco\s*de\s*custo)\s*[:\s]?\s*R?\$?\s*(\d+[.,]\d+|\d+)/i);
  if (costMatch) cost = parseFloat(costMatch[1].replace(',', '.'));

  // Find location by slug/name keywords
  let location_id: string | null = null;
  for (const loc of locations) {
    const locSlug = loc.slug?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || '';
    const locName = loc.name?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || '';
    if (t.includes(locSlug) || t.includes(locName)) {
      location_id = loc.id;
      break;
    }
    // Try first word of name
    const firstWord = locName.split(/\s/)[0];
    if (firstWord && firstWord.length > 2 && t.includes(firstWord)) {
      location_id = loc.id;
      break;
    }
  }

  // Score items by keyword overlap (skip stop words and number-like tokens)
  const stopWords = new Set(['unidades', 'unidade', 'un', 'custo', 'cada', 'ajustar', 'estoque', 'armazem', 'subir', 'baixar', 'adicionar', 'remover', 'adicionei', 'de', 'para', 'com', 'no', 'na', 'um', 'uma']);
  const textTokens = t.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w) && isNaN(Number(w)));

  let bestItem: { id: string; is_product: boolean } | null = null;
  let bestScore = 0;

  for (const item of items) {
    const nameLower = item.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let score = 0;
    for (const token of textTokens) {
      if (nameLower.includes(token)) score += token.length; // weight by length for specificity
    }
    if (score > bestScore) {
      bestScore = score;
      bestItem = { id: item.id, is_product: item.is_product };
    }
  }

  return {
    item_id: bestItem?.id || null,
    is_product: bestItem?.is_product ?? true,
    location_id,
    operation,
    amount,
    cost,
    reason: 'Ajuste via Telegram (parser local)'
  };
}

function getMainKeyboard(profile?: any) {
  const isAdmin = profile && (profile.role === 'admin' || (profile.roles && profile.roles.includes('admin')));
  const keyboard = [
    [{ text: '🛒 Vendas' }, { text: '📦 Compras' }],
    [{ text: '💸 Pagamento' }, { text: '📈 Recebimento' }]
  ];
  if (isAdmin) {
    keyboard.push([{ text: '🔧 Ajustar Estoque' }]);
  }
  return {
    keyboard,
    resize_keyboard: true
  };
}

async function logStep(supabase: any, step: string, details?: any) {
  try {
    await supabase.from('audit_logs').insert({
      table_name: 'telegram_debug',
      action: step,
      new_data: details || {}
    });
  } catch (err) {
    console.error('Failed to log step:', err);
  }
}

const backKeyboard = {
  keyboard: [
    [{ text: '⬅️ Voltar ao Menu' }]
  ],
  resize_keyboard: true,
  one_time_keyboard: true
};

export const maxDuration = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(200).send('Webhook ativo');
  }

  // Lazy initialize clients inside handler to avoid module import failure when variables are not configured yet
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase URL or Key is missing!');
    return res.status(200).send('Configuração do Supabase ausente.');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });



  let profile: any = null;

  try {
    const { message, callback_query } = req.body;

    // Handle Callback Query (Inline Buttons click)
    if (callback_query) {
      const chatId = callback_query.message.chat.id;
      const callbackData = callback_query.data;
      const messageId = callback_query.message.message_id;
      const callbackQueryId = callback_query.id;

      // Authenticate
      const { data: cbProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('telegram_chat_id', chatId.toString())
        .single();
      profile = cbProfile;

      if (!profile) {
        await sendTelegram('answerCallbackQuery', { callback_query_id: callbackQueryId, text: 'Usuário não autenticado.' });
        return res.status(200).send('OK');
      }

      if (callbackData.startsWith('confirm_purchase:') || callbackData.startsWith('conf_p:')) {
        const parts = callbackData.split(':');
        const orderId = parts[1];
        const locationSlug = parts[2] || 'danilo';
        
        await sendTelegram('answerCallbackQuery', { callback_query_id: callbackQueryId, text: 'Enviando para aprovação...' });

        // Update all purchase requests in this order to the selected destination
        const { error: reqUpdateErr } = await supabase
          .from('purchase_requests')
          .update({ destination: locationSlug })
          .eq('order_id', orderId);

        if (reqUpdateErr) throw reqUpdateErr;

        // Fetch location name for feedback message
        const { data: locationData } = await supabase
          .from('stock_locations')
          .select('name')
          .eq('slug', locationSlug)
          .eq('company_id', profile.company_id)
          .maybeSingle();

        const locName = locationData?.name || locationSlug;

        // Update Order status to pending (awaiting review/approval on dashboard)
        const { error: orderStatusErr } = await supabase
          .from('purchase_orders')
          .update({ status: 'pending' })
          .eq('id', orderId);

        if (orderStatusErr) throw orderStatusErr;

        await sendTelegram('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: `✅ *Lote de compra enviado para aprovação no painel web com destino ao ${locName}!*`,
          parse_mode: 'Markdown'
        });
      } else if (callbackData.startsWith('cancel_purchase:') || callbackData.startsWith('canc_p:')) {
        const orderId = callbackData.split(':')[1];

        await sendTelegram('answerCallbackQuery', { callback_query_id: callbackQueryId, text: 'Cancelando...' });

        // Delete order and requests
        await supabase.from('purchase_requests').delete().eq('order_id', orderId);
        await supabase.from('purchase_orders').delete().eq('id', orderId);

        await sendTelegram('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: '❌ *Lançamento de compra cancelado.*',
          parse_mode: 'Markdown'
        });
      }

      return res.status(200).send('OK');
    }

    if (!message) {
      return res.status(200).send('OK');
    }

    const chatId = message.chat.id;
    const text = message.text?.trim();

    // 1. Authenticate user
    const { data: msgProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('telegram_chat_id', chatId.toString())
      .maybeSingle();
    profile = msgProfile;

    // 2. If not authenticated
    if (!profile) {
      if (text && text.startsWith('/vincular')) {
        const parts = text.split(' ');
        const code = parts[1]?.trim();

        if (!code) {
          await sendMessage(chatId, 'Por favor, envie o comando no formato: `/vincular [código]`');
          return res.status(200).send('OK');
        }

        // Find profile with matching code
        const { data: targetProfile, error: linkErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('telegram_link_code', code)
          .maybeSingle();

        if (linkErr || !targetProfile) {
          await sendMessage(chatId, '❌ Código inválido ou expirado. Por favor, gere um novo código no painel web.');
          return res.status(200).send('OK');
        }

        // Bind chat_id and clear code
        const { data: updatedData, error: updateErr } = await supabase
          .from('profiles')
          .update({ telegram_chat_id: chatId.toString(), telegram_link_code: null, telegram_state: null })
          .eq('id', targetProfile.id)
          .select();

        if (updateErr) throw updateErr;
        if (!updatedData || updatedData.length === 0) {
          throw new Error('Nenhum perfil atualizado. Verifique as permissões de RLS ou a chave SUPABASE_SERVICE_ROLE_KEY.');
        }

        await sendMessage(chatId, `🎉 *Conta vinculada com sucesso!*\n\nOlá, *${targetProfile.full_name || 'Usuário'}*! Agora você pode usar os botões abaixo para gerenciar o sistema pelo Telegram.`, getMainKeyboard(targetProfile));
        return res.status(200).send('OK');
      }

      // Default message if not vinculated
      await sendMessage(chatId, '👋 Olá! Este chat do Telegram ainda não está vinculado à sua conta do KB Sweet.\n\nPara vincular:\n1. Acesse seu perfil no sistema web.\n2. Clique em **Gerar Código de Vinculação** na seção Telegram.\n3. Envie aqui o comando:\n`/vincular [código-gerado]`');
      return res.status(200).send('OK');
    }

    // 3. User is authenticated. Handle system commands / buttons.
    if (text === '/start' || text === '/menu') {
      await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
      await sendMessage(chatId, 'Selecione uma opção no menu abaixo para começar:', getMainKeyboard(profile));
      return res.status(200).send('OK');
    }

    if (text === '⬅️ Voltar ao Menu' || text === '/cancelar' || text?.toLowerCase() === 'cancelar') {
      await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
      await sendMessage(chatId, 'Voltou ao menu principal. Selecione uma opção para começar:', getMainKeyboard(profile));
      return res.status(200).send('OK');
    }

    // Check menu button clicks
    if (text === '🛒 Vendas') {
      const { error: stateErr } = await supabase.from('profiles').update({ telegram_state: { action: 'awaiting_sale_details' } }).eq('id', profile.id);
      if (stateErr) throw stateErr;

      // Fetch products and their stocks, including category
      let productsQuery = supabase
        .from('products')
        .select(`
          name,
          category,
          product_stocks (
            quantity,
            location:stock_locations (name)
          )
        `);

      if (profile.company_id) {
        productsQuery = productsQuery.or(`company_id.eq.${profile.company_id},company_id.is.null`);
      } else {
        productsQuery = productsQuery.is('company_id', null);
      }

      const { data: products } = await productsQuery;

      // Format stock list by category, displaying ONLY items with stock > 0
      let stockList = '';
      if (products && products.length > 0) {
        const grouped: { [key: string]: any[] } = {};
        
        products.forEach((p: any) => {
          const stocks = p.product_stocks || [];
          const activeStocks = stocks.filter((s: any) => s.quantity > 0);
          if (activeStocks.length > 0) {
            const category = p.category || 'Geral';
            if (!grouped[category]) grouped[category] = [];
            grouped[category].push({
              name: p.name,
              stocks: activeStocks
            });
          }
        });

        const categories = Object.keys(grouped).sort();
        if (categories.length > 0) {
          stockList = '📋 *Produtos Disponíveis em Estoque:*\n\n';
          categories.forEach((cat: string) => {
            stockList += `*${cat.toUpperCase()}*\n`;
            grouped[cat].forEach((p: any) => {
              const stockDetails = p.stocks
                .map((s: any) => `${s.quantity} un no ${s.location?.name || 'Estoque'}`)
                .join(', ');
              stockList += `• *${p.name}*: ${stockDetails}\n`;
            });
            stockList += '\n';
          });
        } else {
          stockList = '📋 *Produtos Disponíveis em Estoque:*\n_Nenhum produto com estoque disponível no momento._\n\n';
        }
      }

      await sendMessage(chatId, `✍️ *Registrar Venda*\n\n${stockList}Por favor, digite os detalhes da venda em linguagem natural.\n\n*Exemplo:*\n_vendi 2 bolos de pote por 15 reais cada no Pix para o cliente João_`, backKeyboard);
      return res.status(200).send('OK');
    }

    if (text === '📦 Compras') {
      await supabase.from('profiles').update({ telegram_state: { action: 'awaiting_purchase_file' } }).eq('id', profile.id);
      await sendMessage(chatId, '📸 *Registrar Compra via Nota Fiscal*\n\nPor favor, envie a foto ou o PDF da Nota Fiscal/Cupom de compra.', backKeyboard);
      return res.status(200).send('OK');
    }

    if (text === '💸 Pagamento') {
      await supabase.from('profiles').update({ telegram_state: { action: 'awaiting_payment_details' } }).eq('id', profile.id);
      await sendMessage(chatId, '💸 *Registrar Saída (Pagamento Avulso)*\n\nDigite a descrição e o valor do pagamento.\n\n_Exemplo:_\n`pagamento de R$ 120 da conta de água`', backKeyboard);
      return res.status(200).send('OK');
    }

    if (text === '📈 Recebimento') {
      await supabase.from('profiles').update({ telegram_state: { action: 'awaiting_income_details' } }).eq('id', profile.id);
      await sendMessage(chatId, '📈 *Registrar Entrada (Recebimento Avulso)*\n\nDigite a descrição e o valor do recebimento.\n\n_Exemplo:_\n`recebi 50 reais de taxa de entrega`', backKeyboard);
      return res.status(200).send('OK');
    }

    const isAdmin = profile && (profile.role === 'admin' || (profile.roles && profile.roles.includes('admin')));

    if (text === '🔧 Ajustar Estoque' && isAdmin) {
      const { error: stateErr } = await supabase.from('profiles').update({ telegram_state: { action: 'awaiting_stock_adjustment' } }).eq('id', profile.id);
      if (stateErr) throw stateErr;

      await sendMessage(chatId, '🔧 *Ajustar Estoque (Admin)*\n\nPor favor, digite o item, a quantidade e o armazém que deseja ajustar.\n\n*Exemplos:*\n• _adicionei 10 trufas de maracujá no estoque danilo_\n• _ajustar bolo de pote para 5 unidades no armazem 3_\n• _subir saldo de laco maxi m rosa em 20 unidades no estoque adriel_', backKeyboard);
      return res.status(200).send('OK');
    }

    // Process input based on state
    const state = profile.telegram_state as any;
    const action = state?.action;

    if (!action) {
      await sendMessage(chatId, 'Por favor, escolha uma das opções do menu:', getMainKeyboard(profile));
      return res.status(200).send('OK');
    }

    // Awaiting Stock Adjustment Flow
    if (action === 'awaiting_stock_adjustment') {
      if (!text) {
        await sendMessage(chatId, 'Por favor, envie os detalhes em formato texto.');
        return res.status(200).send('OK');
      }

      await sendMessage(chatId, '⏳ *Processando ajuste de estoque com inteligência artificial...*');
      await logStep(supabase, 'start_adjustment', { text, profile_id: profile.id });

      // Fetch products, ingredients, locations
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
      } else {
        productsQuery = productsQuery.is('company_id', null);
        ingredientsQuery = ingredientsQuery.is('company_id', null);
        locationsQuery = locationsQuery.is('company_id', null);
      }

      const [productsRes, ingredientsRes, locationsRes] = await Promise.all([
        productsQuery,
        ingredientsQuery,
        locationsQuery
      ]);

      await logStep(supabase, 'queries_fetched', { 
        products_count: productsRes.data?.length || 0,
        ingredients_count: ingredientsRes.data?.length || 0,
        locations_count: locationsRes.data?.length || 0,
        errors: { products: productsRes.error, ingredients: ingredientsRes.error, locations: locationsRes.error }
      });

      const products = productsRes.data || [];
      const ingredients = ingredientsRes.data || [];
      const locations = locationsRes.data || [];

      const items = [
        ...products.map(p => ({ ...p, is_product: true })),
        ...ingredients.map(i => ({ ...i, is_product: false }))
      ];

      // Pre-filter items based on keyword matching to reduce payload size and speed up Gemini response
      const stopWords = new Set(['unidades', 'unidade', 'custo', 'cada', 'ajustar', 'estoque', 'danilo', 'adriel', 'armazem', 'subir', 'baixar', 'adicionar', 'remover', 'de', 'para', 'com', 'no', 'na', 'um', 'uma', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez']);
      const textLower = text.toLowerCase();
      const textWords = textLower
        .replace(/[^a-z0-9áéíóúãõç]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !stopWords.has(w));

      const scoredItems = items.map(item => {
        const nameLower = item.name.toLowerCase();
        let score = 0;
        for (const word of textWords) {
          if (nameLower.includes(word)) {
            score += 2;
          }
        }
        return { item, score };
      });

      let filteredItems = scoredItems
        .filter(si => si.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(si => si.item);

      if (filteredItems.length === 0) {
        filteredItems = items.slice(0, 15);
      } else {
        filteredItems = filteredItems.slice(0, 15);
      }

      const prompt = `Você é o assistente inteligente do KB Sweet. Analise a mensagem de ajuste de estoque enviada pelo usuário (um administrador) e mapeie o item correto, o local de estoque (armazém) correto, a operação (definir valor exato "set", adicionar quantidade "add" ou subtrair quantidade "subtract") e a quantidade.

Mensagem do usuário: "${text}"

Produtos e Ingredientes disponíveis:
${JSON.stringify(filteredItems.map(i => ({ id: i.id, name: i.name, is_product: i.is_product })))}

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

      await logStep(supabase, 'before_gemini_call', { has_prompt: !!prompt });

      let parsed: any = {};
      let usedLocalParser = false;

      try {
        const aiResponse = await generateContentWithRetry(prompt);
        await logStep(supabase, 'after_gemini_call', { response_text: aiResponse.text });

        // Strip markdown code fences if present
        const rawText = (aiResponse.text || '').replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        parsed = JSON.parse(rawText || '{}');
      } catch (aiErr: any) {
        const isQuotaErr = aiErr?.message?.includes('429') || aiErr?.message?.includes('quota') || aiErr?.message?.includes('RESOURCE_EXHAUSTED');
        console.warn('Gemini failed, falling back to local parser:', aiErr?.message);
        await logStep(supabase, 'gemini_fallback', { error: aiErr?.message, is_quota: isQuotaErr });

        // Use local parser as fallback
        parsed = parseStockAdjustmentLocally(text, items, locations);
        usedLocalParser = true;

        if (!parsed.item_id || !parsed.amount) {
          const errMsg = isQuotaErr
            ? '⚠️ *Cota da IA esgotada.* Tente com um formato mais direto:\n`subir 2 unidades [nome do produto] estoque [danilo/adriel]`'
            : '❌ Não consegui identificar o item. Tente: `subir 2 unidades [nome] estoque [local]`';
          await sendMessage(chatId, errMsg, getMainKeyboard(profile));
          await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
          return res.status(200).send('OK');
        }
      }

      if (!parsed.item_id || parsed.amount === undefined) {
        await sendMessage(chatId, '❌ Não consegui identificar o item ou a quantidade do ajuste na mensagem. Por favor, tente descrever de forma mais clara (ex: "adicionei 10 trufas de maracujá no estoque danilo").', getMainKeyboard(profile));
        await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
        return res.status(200).send('OK');
      }

      const matchedItem = items.find(i => i.id === parsed.item_id);
      if (!matchedItem) {
        await sendMessage(chatId, '❌ Item não encontrado no banco de dados.', getMainKeyboard(profile));
        await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
        return res.status(200).send('OK');
      }

      const locationId = parsed.location_id || locations?.[0]?.id;
      const matchedLocation = locations?.find(l => l.id === locationId);
      
      if (!matchedLocation) {
        await sendMessage(chatId, '❌ Local de estoque (armazém) não encontrado.', getMainKeyboard(profile));
        await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
        return res.status(200).send('OK');
      }

      // Calculate current stock
      const stockRecord = matchedItem.product_stocks?.find((s: any) => s.location_id === locationId);
      const currentQty = stockRecord ? Number(stockRecord.quantity) : 0;

      let newQty = currentQty;
      if (parsed.operation === 'set') {
        newQty = Number(parsed.amount);
      } else if (parsed.operation === 'add') {
        newQty = currentQty + Number(parsed.amount);
      } else if (parsed.operation === 'subtract') {
        newQty = currentQty - Number(parsed.amount);
      }

      // Apply adjustment via Supabase RPC
      // The DB constraint only allows 'danilo' or 'adriel' as stock_owner values
      const slugLower = (matchedLocation.slug || '').toLowerCase();
      let stockOwner = 'danilo'; // default fallback
      if (slugLower.includes('adriel')) stockOwner = 'adriel';
      else if (slugLower.includes('danilo')) stockOwner = 'danilo';

      const rpcName = matchedItem.is_product ? 'apply_product_stock_adjustment' : 'apply_stock_adjustment';
      const rpcParams: any = {
        p_new_stock: newQty,
        p_stock_owner: stockOwner,
        p_reason: parsed.reason || 'Ajuste Telegram',
        p_type: newQty >= currentQty ? 'found' : 'loss'
      };

      if (matchedItem.is_product) {
        rpcParams.p_product_id = matchedItem.id;
      } else {
        rpcParams.p_ingredient_id = matchedItem.id;
      }

      const { error: rpcErr } = await supabase.rpc(rpcName, rpcParams);
      if (rpcErr) throw rpcErr;

      // Handle cost update if specified
      let costFeedback = '';
      if (parsed.cost !== undefined && parsed.cost !== null) {
        const newCostVal = Number(parsed.cost);
        const updatePayload: any = {
          cost: newCostVal
        };

        if (matchedLocation.slug === 'stock-danilo' || matchedLocation.slug === 'danilo') {
          updatePayload['cost_danilo'] = newCostVal;
        } else if (matchedLocation.slug === 'stock-adriel' || matchedLocation.slug === 'adriel') {
          updatePayload['cost_adriel'] = newCostVal;
        }

        const table = matchedItem.is_product ? 'products' : 'ingredients';
        const { error: costErr } = await supabase.from(table).update(updatePayload).eq('id', matchedItem.id);
        if (costErr) throw costErr;

        // Update location-specific cost
        const { data: existingStock } = await supabase.from('product_stocks')
          .select('id')
          .eq('location_id', matchedLocation.id)
          .eq(matchedItem.is_product ? 'product_id' : 'ingredient_id', matchedItem.id)
          .maybeSingle();

        if (existingStock) {
          const { error: stockCostErr } = await supabase.from('product_stocks')
            .update({ average_cost: newCostVal, last_updated: new Date().toISOString() })
            .eq('id', existingStock.id);
          if (stockCostErr) throw stockCostErr;
        } else {
          const insertData: any = {
            location_id: matchedLocation.id,
            average_cost: newCostVal,
            quantity: newQty,
            last_updated: new Date().toISOString()
          };
          if (matchedItem.is_product) insertData.product_id = matchedItem.id;
          else insertData.ingredient_id = matchedItem.id;

          const { error: insertErr } = await supabase.from('product_stocks').insert(insertData);
          if (insertErr) throw insertErr;
        }
        costFeedback = `\n*Custo unitário atualizado:* R$ ${newCostVal.toFixed(2)}`;
      }

      const localParserNote = usedLocalParser ? '\n⚠️ _IA indisponível — ajuste processado pelo modo local._' : '';
      await sendMessage(chatId, `✅ *Ajuste de estoque concluído com sucesso!*\n\n*Item:* ${matchedItem.name}\n*Armazém:* ${matchedLocation.name}\n*Estoque anterior:* ${currentQty} un\n*Novo estoque:* ${newQty} un${costFeedback}\n*Lançamento de ajuste gerado.*${localParserNote}`, getMainKeyboard(profile));
      await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);

      return res.status(200).send('OK');
    }

    // Awaiting Sale Details Flow
    if (action === 'awaiting_sale_details') {
      if (!text) {
        await sendMessage(chatId, 'Por favor, envie os detalhes em formato texto.');
        return res.status(200).send('OK');
      }

      await sendMessage(chatId, '⏳ *Analisando venda com inteligência artificial...*');

      // Fetch products, clients, locations (allowing private company items and shared global ones)
      let productsQuery = supabase.from('products').select('id, name, price, cost');
      let clientsQuery = supabase.from('clients').select('id, name');
      let locationsQuery = supabase.from('stock_locations').select('id, name, slug');

      if (profile.company_id) {
        productsQuery = productsQuery.or(`company_id.eq.${profile.company_id},company_id.is.null`);
        clientsQuery = clientsQuery.or(`company_id.eq.${profile.company_id},company_id.is.null`);
        locationsQuery = locationsQuery.or(`company_id.eq.${profile.company_id},company_id.is.null`);
      } else {
        productsQuery = productsQuery.is('company_id', null);
        clientsQuery = clientsQuery.is('company_id', null);
        locationsQuery = locationsQuery.is('company_id', null);
      }

      const [productsRes, clientsRes, locationsRes] = await Promise.all([
        productsQuery,
        clientsQuery,
        locationsQuery
      ]);

      const products = productsRes.data || [];
      const clients = clientsRes.data || [];
      const locations = locationsRes.data || [];

      const productsList = products;

      // Pre-filter products based on keyword matching to reduce payload size and speed up Gemini response
      const stopWords = new Set(['venda', 'vendi', 'cliente', 'pagamento', 'estoque', 'danilo', 'adriel', 'armazem', 'pix', 'dinheiro', 'cartao', 'de', 'para', 'com', 'no', 'na', 'um', 'uma', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez']);
      const textLower = text.toLowerCase();
      const textWords = textLower
        .replace(/[^a-z0-9áéíóúãõç]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !stopWords.has(w));

      const scoredProducts = productsList.map(p => {
        const nameLower = p.name.toLowerCase();
        let score = 0;
        for (const word of textWords) {
          if (nameLower.includes(word)) {
            score += 2;
          }
        }
        return { p, score };
      });

      let filteredProducts = scoredProducts
        .filter(sp => sp.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(sp => sp.p);

      if (filteredProducts.length === 0) {
        filteredProducts = productsList.slice(0, 15);
      } else {
        filteredProducts = filteredProducts.slice(0, 15);
      }

      const prompt = `Você é o assistente inteligente do KB Sweet. Analise a mensagem de venda enviada pelo usuário e mapeie os produtos, cliente, método de pagamento e local de estoque corretos a partir das listas fornecidas.

Mensagem do usuário: "${text}"

Produtos disponíveis:
${JSON.stringify(filteredProducts)}

Clientes disponíveis:
${JSON.stringify(clients || [])}

Locais de estoque disponíveis:
${JSON.stringify(locations || [])}

Retorne um JSON seguindo exatamente este formato:
{
  "client_id": "uuid-do-cliente-ou-null",
  "location_id": "uuid-do-local-de-estoque-se-nao-encontrar-use-o-primeiro-da-lista",
  "payment_method": "metodo-de-pagamento-detectado-ex-pix-dinheiro-cartao",
  "discount": 0,
  "items": [
    {
      "product_id": "uuid-do-produto",
      "quantity": 2,
      "unit_price": 15.0
    }
  ]
}`;

      const aiResponse = await generateContentWithRetry(prompt);

      const parsed = JSON.parse(aiResponse.text || '{}');

      if (!parsed.items || parsed.items.length === 0) {
        await sendMessage(chatId, '❌ Não consegui identificar nenhum produto na mensagem. Por favor, tente descrever novamente de forma mais clara.', getMainKeyboard(profile));
        await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
        return res.status(200).send('OK');
      }

      // Record Sale via RPC
      const itemsPayload = parsed.items.map((item: any) => {
        const originalProd = products?.find(p => p.id === item.product_id);
        return {
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          cost: originalProd?.cost || 0
        };
      });

      const total = itemsPayload.reduce((acc: number, item: any) => acc + (item.quantity * item.unit_price), 0) - (parsed.discount || 0);

      // Default location if missing
      const locationId = parsed.location_id || locations?.[0]?.id;

      const { data: saleId, error: saleErr } = await supabase.rpc('process_sale', {
        p_items: itemsPayload,
        p_total: total,
        p_discount: parsed.discount || 0,
        p_payment_method: parsed.payment_method || 'outro',
        p_client_id: parsed.client_id,
        p_location_id: locationId
      });

      if (saleErr) throw saleErr;

      // Build summary
      const clientName = clients?.find(c => c.id === parsed.client_id)?.name || 'Cliente Avulso';
      const summaryItems = itemsPayload.map((item: any) => {
        const name = products?.find(p => p.id === item.product_id)?.name || 'Produto';
        return `• ${item.quantity}x ${name} (R$ ${item.unit_price.toFixed(2)})`;
      }).join('\n');

      await sendMessage(chatId, `✅ *Venda registrada com sucesso!*\n\n*Cliente:* ${clientName}\n*Itens:*\n${summaryItems}\n*Total:* R$ ${total.toFixed(2)}\n*Pagamento:* ${parsed.payment_method?.toUpperCase()}\n\nEstoque atualizado e lançamento financeiro gerado.`, getMainKeyboard(profile));
      await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
      return res.status(200).send('OK');
    }

    // Awaiting Payments or Incomes details
    if (action === 'awaiting_payment_details' || action === 'awaiting_income_details') {
      if (!text) {
        await sendMessage(chatId, 'Por favor, envie os detalhes em formato texto.');
        return res.status(200).send('OK');
      }

      await sendMessage(chatId, '⏳ *Lançando movimentação no financeiro...*');

      const isPayment = action === 'awaiting_payment_details';

      const prompt = `Você é o assistente inteligente do KB Sweet. Analise a mensagem de movimentação financeira (${isPayment ? 'pagamento/despesa' : 'recebimento/entrada'}) e extraia a descrição curta e o valor.

Mensagem do usuário: "${text}"

Retorne um JSON seguindo exatamente este formato:
{
  "description": "Descrição curta do lançamento",
  "amount": 150.0
}`;

      const aiResponse = await generateContentWithRetry(prompt);

      const parsed = JSON.parse(aiResponse.text || '{}');

      if (!parsed.amount || !parsed.description) {
        await sendMessage(chatId, '❌ Não consegui extrair o valor ou a descrição. Digite novamente de forma simples (ex: R$ 50 taxa de entrega).', getMainKeyboard(profile));
        await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
        return res.status(200).send('OK');
      }

      const finalAmount = isPayment ? -Math.abs(parsed.amount) : Math.abs(parsed.amount);

      const { error: financialErr } = await supabase.from('financial_movements').insert({
        description: `${isPayment ? 'Saída' : 'Entrada'} Telegram: ${parsed.description}`,
        amount: finalAmount,
        type: isPayment ? 'expense' : 'income',
        status: 'completed',
        due_date: new Date().toISOString(),
        company_id: profile.company_id
      });

      if (financialErr) throw financialErr;

      await sendMessage(chatId, `✅ *Movimentação financeira lançada com sucesso!*\n\n*Tipo:* ${isPayment ? '🔴 Saída/Despesa' : '🟢 Entrada/Receita'}\n*Descrição:* ${parsed.description}\n*Valor:* R$ ${parsed.amount.toFixed(2)}`, getMainKeyboard(profile));
      await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
      return res.status(200).send('OK');
    }

    // Awaiting Purchase File Flow
    if (action === 'awaiting_purchase_file') {
      const photo = message.photo;
      const document = message.document;

      if (!photo && !document) {
        await sendMessage(chatId, '❌ Por favor, envie uma Foto ou um PDF do cupom fiscal / nota de compra.', getMainKeyboard(profile));
        await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
        return res.status(200).send('OK');
      }

      await sendMessage(chatId, '⏳ *Baixando arquivo e processando nota com inteligência artificial...*');

      // Get file ID
      let fileId = '';
      let mimeType = 'image/jpeg';

      if (photo) {
        fileId = photo[photo.length - 1].file_id;
      } else if (document) {
        if (document.file_size && document.file_size > 10 * 1024 * 1024) {
          await sendMessage(chatId, '⚠️ *O arquivo enviado é muito grande (maior que 10MB).* Por favor, envie uma foto ou um arquivo PDF menor para garantir o processamento.', getMainKeyboard(profile));
          await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
          return res.status(200).send('OK');
        }
        fileId = document.file_id;
        mimeType = document.mime_type || 'application/pdf';
      }

      // Get File URL from Telegram API
      const fileInfo = await sendTelegram('getFile', { file_id: fileId });
      if (!fileInfo.ok || !fileInfo.result?.file_path) {
        throw new Error('Falha ao obter dados do arquivo do Telegram.');
      }

      const filePath = fileInfo.result.file_path;
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

      const fileBuffer = await fetch(downloadUrl).then(res => res.arrayBuffer());
      const base64Data = Buffer.from(fileBuffer).toString('base64');

      // Fetch ingredients, suppliers and stock locations (allowing private company items and shared global ones)
      let ingredientsQuery = supabase.from('ingredients').select('id, name, unit');
      let suppliersQuery = supabase.from('suppliers').select('id, name');
      let locationsQuery = supabase.from('stock_locations').select('id, name, slug');

      if (profile.company_id) {
        ingredientsQuery = ingredientsQuery.or(`company_id.eq.${profile.company_id},company_id.is.null`);
        suppliersQuery = suppliersQuery.or(`company_id.eq.${profile.company_id},company_id.is.null`);
        locationsQuery = locationsQuery.eq('company_id', profile.company_id);
      } else {
        ingredientsQuery = ingredientsQuery.is('company_id', null);
        suppliersQuery = suppliersQuery.is('company_id', null);
        locationsQuery = locationsQuery.is('company_id', null);
      }

      const { data: ingredients } = await ingredientsQuery;
      const { data: suppliers } = await suppliersQuery;
      const { data: locations } = await locationsQuery;

      const prompt = `Você é o assistente inteligente do KB Sweet. Analise a nota fiscal (imagem/PDF) fornecida e extraia os itens de compra, o fornecedor, o valor total e mapeie para os ingredientes e fornecedores existentes da lista, se houver.

IMPORTANTE SOBRE MAPEAMENTO DE INGREDIENTES:
Você deve fazer um mapeamento inteligente. As descrições dos itens na nota fiscal podem variar de acordo com o mercado (por exemplo: abreviações, marcas ou formatos de embalagem descritos de forma ligeiramente diferente, como "SACOLA KRAFT M" vs "SACOLA KRAFT TAM M"). Mapeie para o "id" do ingrediente da lista que seja semanticamente o mesmo produto, mesmo que o nome não seja 100% idêntico. Só crie um novo item (retornando "ingredient_id": null) se o insumo realmente não existir na lista.

Ingredientes disponíveis:
${JSON.stringify(ingredients || [])}

Fornecedores disponíveis:
${JSON.stringify(suppliers || [])}

Retorne um JSON seguindo exatamente este formato:
{
  "supplier_id": "uuid-do-fornecedor-existente-ou-null",
  "supplier_name": "Nome do fornecedor extraído da nota",
  "total_value": 150.0,
  "items": [
    {
      "item_name": "Nome do item na nota",
      "ingredient_id": "uuid-do-ingrediente-mapeado-ou-null",
      "quantity": 5.0,
      "unit": "kg",
      "unit_price": 10.0,
      "total_price": 50.0,
      "destination": "uuid-do-local-de-estoque"
    }
  ]
}`;

      const aiResponse = await generateContentWithRetry(prompt, {
        mimeType: mimeType,
        data: base64Data
      });

      const parsed = JSON.parse(aiResponse.text || '{}');

      if (!parsed.items || parsed.items.length === 0) {
        await sendMessage(chatId, '❌ Não consegui extrair os itens desta nota fiscal. Por favor, tente enviar outra foto mais nítida.', getMainKeyboard(profile));
        await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
        return res.status(200).send('OK');
      }

      // Check if we need to create a supplier
      let supplierId = parsed.supplier_id;
      if (!supplierId && parsed.supplier_name) {
        const { data: newSup, error: supErr } = await supabase
          .from('suppliers')
          .insert({ name: parsed.supplier_name, company_id: profile.company_id })
          .select()
          .single();
        if (!supErr && newSup) {
          supplierId = newSup.id;
        }
      }

      // Process items: auto-create missing ingredients if they don't exist
      for (const item of parsed.items) {
        let ingId = item.ingredient_id;
        
        if (!ingId) {
          // Double check if name matches case-insensitive in loaded ingredients
          const match = ingredients?.find(i => i.name.toLowerCase().trim() === item.item_name.toLowerCase().trim());
          if (match) {
            ingId = match.id;
          } else {
            // Auto-create new ingredient in the database
            const { data: newIng, error: ingCreateErr } = await supabase
              .from('ingredients')
              .insert({
                name: item.item_name,
                unit: item.unit || 'un',
                category: 'Outros',
                type: 'stock',
                stock_danilo: 0,
                stock_adriel: 0,
                cost: 0,
                cost_danilo: 0,
                cost_adriel: 0,
                is_active: true,
                company_id: profile.company_id
              })
              .select()
              .single();

            if (ingCreateErr) {
              console.error('Error creating ingredient:', ingCreateErr);
            } else if (newIng) {
              ingId = newIng.id;
            }
          }
        }
        item.ingredient_id = ingId;
      }

      // Create a new purchase order
      const { data: order, error: orderErr } = await supabase
        .from('purchase_orders')
        .insert({
          nickname: `Nota Telegram: ${parsed.supplier_name || 'Nota Fiscal'}`,
          supplier_id: supplierId,
          created_by: profile.id,
          status: 'open',
          total_value: parsed.total_value || 0,
          company_id: profile.company_id
        })
        .select()
        .single();

      if (orderErr) throw orderErr;

      // Create purchase requests
      const requestsPayload = parsed.items.map((item: any) => {
        // Calculate total cost correctly: total_price if extracted, or unit_price * quantity, or cost as fallback
        const finalCost = item.total_price || (item.unit_price * item.quantity) || item.cost || 0;
        return {
          order_id: order.id,
          user_id: profile.id,
          item_name: item.item_name,
          ingredient_id: item.ingredient_id || null,
          quantity: item.quantity,
          unit: item.unit || 'un',
          cost: finalCost,
          destination: item.destination || 'danilo',
          status: 'pending',
          company_id: profile.company_id
        };
      });

      const { error: reqErr } = await supabase.from('purchase_requests').insert(requestsPayload);
      if (reqErr) throw reqErr;

      // Build preview message
      const itemsList = parsed.items.map((item: any) => {
        const found = ingredients?.find(i => i.id === item.ingredient_id);
        const mappingName = found ? found.name : '🆕 Cadastrado Automático';
        const finalCost = item.total_price || (item.unit_price * item.quantity) || item.cost || 0;
        return `• ${item.quantity} ${item.unit} - ${item.item_name} (R$ ${finalCost.toFixed(2)})\n  └─ Mapeado para: *${mappingName}*`;
      }).join('\n');

      const inlineKeyboard = {
        inline_keyboard: [
          ...(locations || []).map((loc: any) => [
            { text: `📍 Enviar para: ${loc.name}`, callback_data: `conf_p:${order.id}:${loc.slug}` }
          ]),
          [
            { text: '❌ Cancelar Lote', callback_data: `canc_p:${order.id}` }
          ]
        ]
      };

      await sendMessage(chatId, `📝 *Nota Fiscal Processada com Sucesso!*\n\n*Fornecedor:* ${parsed.supplier_name || 'Desconhecido'}\n*Valor Total:* R$ ${(parsed.total_value || 0).toFixed(2)}\n\n*Itens Extraídos:*\n${itemsList}\n\n*Por favor, escolha abaixo o estoque de destino para a entrada deste lote:*`, inlineKeyboard);

      await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
      return res.status(200).send('OK');
    }

  } catch (error: any) {
    console.error('Webhook Error:', error);
    const chatId = req.body?.message?.chat?.id || req.body?.callback_query?.message?.chat?.id;
    if (chatId) {
      try {
        await logStep(supabase, 'webhook_error_catch', { error: error.message || error.toString() });
      } catch (logErr) {
        console.error('Failed to log error to database:', logErr);
      }
      try {
        if (profile?.id) {
          await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
        }
      } catch (dbErr) {
        console.error('Failed to clear state:', dbErr);
      }
      try {
        const errorText = error.message || error.toString();
        await sendMessage(chatId, `❌ Erro ao processar requisição:\n${errorText}`, getMainKeyboard(profile), '');
      } catch (tgErr) {
        console.error('Failed to send error message:', tgErr);
      }
    }
  }

  return res.status(200).send('OK');
}
