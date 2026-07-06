import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

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

async function sendMessage(chatId: string | number, text: string, replyMarkup?: any) {
  return sendTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: replyMarkup
  });
}

const mainKeyboard = {
  keyboard: [
    [{ text: '🛒 Vendas' }, { text: '📦 Compras' }],
    [{ text: '💸 Pagamento' }, { text: '📈 Recebimento' }]
  ],
  resize_keyboard: true
};

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

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  try {
    const { message, callback_query } = req.body;

    // Handle Callback Query (Inline Buttons click)
    if (callback_query) {
      const chatId = callback_query.message.chat.id;
      const callbackData = callback_query.data;
      const messageId = callback_query.message.message_id;
      const callbackQueryId = callback_query.id;

      // Authenticate
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('telegram_chat_id', chatId.toString())
        .single();

      if (!profile) {
        await sendTelegram('answerCallbackQuery', { callback_query_id: callbackQueryId, text: 'Usuário não autenticado.' });
        return res.status(200).send('OK');
      }

      if (callbackData.startsWith('confirm_purchase:')) {
        const orderId = callbackData.split(':')[1];
        
        await sendTelegram('answerCallbackQuery', { callback_query_id: callbackQueryId, text: 'Processando lançamento...' });

        // Fetch requests in this order
        const { data: requests, error: fetchReqErr } = await supabase
          .from('purchase_requests')
          .select('*')
          .eq('order_id', orderId);

        if (fetchReqErr || !requests) throw new Error(fetchReqErr?.message || 'Itens não encontrados');

        // Approve each item (stock movement & financial entry)
        for (const reqItem of requests) {
          if (reqItem.status === 'pending') {
            const { error: approveErr } = await supabase.rpc('approve_purchase_item', {
              p_request_id: reqItem.id,
              p_user_id: profile.id
            });
            if (approveErr) throw approveErr;
          }
        }

        // Update Order status to completed
        await supabase.from('purchase_orders').update({ status: 'approved' }).eq('id', orderId);

        await sendTelegram('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: '✅ *Compra lançada e estoques atualizados com sucesso!*',
          parse_mode: 'Markdown'
        });
      } else if (callbackData.startsWith('cancel_purchase:')) {
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
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('telegram_chat_id', chatId.toString())
      .maybeSingle();

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
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({ telegram_chat_id: chatId.toString(), telegram_link_code: null, telegram_state: null })
          .eq('id', targetProfile.id);

        if (updateErr) throw updateErr;

        await sendMessage(chatId, `🎉 *Conta vinculada com sucesso!*\n\nOlá, *${targetProfile.full_name || 'Usuário'}*! Agora você pode usar os botões abaixo para gerenciar o sistema pelo Telegram.`, mainKeyboard);
        return res.status(200).send('OK');
      }

      // Default message if not vinculated
      await sendMessage(chatId, '👋 Olá! Este chat do Telegram ainda não está vinculado à sua conta do KB Sweet.\n\nPara vincular:\n1. Acesse seu perfil no sistema web.\n2. Clique em **Gerar Código de Vinculação** na seção Telegram.\n3. Envie aqui o comando:\n`/vincular [código-gerado]`');
      return res.status(200).send('OK');
    }

    // 3. User is authenticated. Handle system commands / buttons.
    if (text === '/start' || text === '/menu') {
      await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
      await sendMessage(chatId, 'Selecione uma opção no menu abaixo para começar:', mainKeyboard);
      return res.status(200).send('OK');
    }

    // Check menu button clicks
    if (text === '🛒 Vendas') {
      await supabase.from('profiles').update({ telegram_state: { action: 'awaiting_sale_details' } }).eq('id', profile.id);
      await sendMessage(chatId, '✍️ *Registrar Venda*\n\nPor favor, digite os detalhes da venda em linguagem natural.\n\n_Exemplo:_\n`vendi 2 bolos de pote por 15 reais cada no Pix para o cliente João`', { remove_keyboard: true });
      return res.status(200).send('OK');
    }

    if (text === '📦 Compras') {
      await supabase.from('profiles').update({ telegram_state: { action: 'awaiting_purchase_file' } }).eq('id', profile.id);
      await sendMessage(chatId, '📸 *Registrar Compra via Nota Fiscal*\n\nPor favor, envie a foto ou o PDF da Nota Fiscal/Cupom de compra.', { remove_keyboard: true });
      return res.status(200).send('OK');
    }

    if (text === '💸 Pagamento') {
      await supabase.from('profiles').update({ telegram_state: { action: 'awaiting_payment_details' } }).eq('id', profile.id);
      await sendMessage(chatId, '💸 *Registrar Saída (Pagamento Avulso)*\n\nDigite a descrição e o valor do pagamento.\n\n_Exemplo:_\n`pagamento de R$ 120 da conta de água`', { remove_keyboard: true });
      return res.status(200).send('OK');
    }

    if (text === '📈 Recebimento') {
      await supabase.from('profiles').update({ telegram_state: { action: 'awaiting_income_details' } }).eq('id', profile.id);
      await sendMessage(chatId, '📈 *Registrar Entrada (Recebimento Avulso)*\n\nDigite a descrição e o valor do recebimento.\n\n_Exemplo:_\n`recebi 50 reais de taxa de entrega`', { remove_keyboard: true });
      return res.status(200).send('OK');
    }

    // Process input based on state
    const state = profile.telegram_state as any;
    const action = state?.action;

    if (!action) {
      await sendMessage(chatId, 'Por favor, escolha uma das opções do menu:', mainKeyboard);
      return res.status(200).send('OK');
    }

    // Awaiting Sale Details Flow
    if (action === 'awaiting_sale_details') {
      if (!text) {
        await sendMessage(chatId, 'Por favor, envie os detalhes em formato texto.');
        return res.status(200).send('OK');
      }

      await sendMessage(chatId, '⏳ *Analisando venda com inteligência artificial...*');

      // Fetch products, clients, locations
      const { data: products } = await supabase.from('products').select('id, name, price, cost').eq('company_id', profile.company_id);
      const { data: clients } = await supabase.from('clients').select('id, name').eq('company_id', profile.company_id);
      const { data: locations } = await supabase.from('stock_locations').select('id, name, slug').eq('company_id', profile.company_id);

      const prompt = `Você é o assistente inteligente do KB Sweet. Analise a mensagem de venda enviada pelo usuário e mapeie os produtos, cliente, método de pagamento e local de estoque corretos a partir das listas fornecidas.

Mensagem do usuário: "${text}"

Produtos disponíveis:
${JSON.stringify(products || [])}

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

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [prompt],
        config: { responseMimeType: 'application/json' }
      });

      const parsed = JSON.parse(aiResponse.text || '{}');

      if (!parsed.items || parsed.items.length === 0) {
        await sendMessage(chatId, '❌ Não consegui identificar nenhum produto na mensagem. Por favor, tente descrever novamente de forma mais clara.', mainKeyboard);
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

      await sendMessage(chatId, `✅ *Venda registrada com sucesso!*\n\n*Cliente:* ${clientName}\n*Itens:*\n${summaryItems}\n*Total:* R$ ${total.toFixed(2)}\n*Pagamento:* ${parsed.payment_method?.toUpperCase()}\n\nEstoque atualizado e lançamento financeiro gerado.`, mainKeyboard);
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

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [prompt],
        config: { responseMimeType: 'application/json' }
      });

      const parsed = JSON.parse(aiResponse.text || '{}');

      if (!parsed.amount || !parsed.description) {
        await sendMessage(chatId, '❌ Não consegui extrair o valor ou a descrição. Digite novamente de forma simples (ex: R$ 50 taxa de entrega).', mainKeyboard);
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

      await sendMessage(chatId, `✅ *Movimentação financeira lançada com sucesso!*\n\n*Tipo:* ${isPayment ? '🔴 Saída/Despesa' : '🟢 Entrada/Receita'}\n*Descrição:* ${parsed.description}\n*Valor:* R$ ${parsed.amount.toFixed(2)}`, mainKeyboard);
      await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
      return res.status(200).send('OK');
    }

    // Awaiting Purchase File Flow
    if (action === 'awaiting_purchase_file') {
      const photo = message.photo;
      const document = message.document;

      if (!photo && !document) {
        await sendMessage(chatId, '❌ Por favor, envie uma Foto ou um PDF do cupom fiscal / nota de compra.', mainKeyboard);
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

      // Fetch ingredients and suppliers
      const { data: ingredients } = await supabase.from('ingredients').select('id, name, unit').eq('company_id', profile.company_id);
      const { data: suppliers } = await supabase.from('suppliers').select('id, name').eq('company_id', profile.company_id);

      const prompt = `Você é o assistente inteligente do KB Sweet. Analise a nota fiscal (imagem/PDF) fornecida e extraia os itens de compra, o fornecedor, o valor total e mapeie para os ingredientes e fornecedores existentes da lista, se houver.

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
      "cost": 50.0,
      "destination": "danilo"
    }
  ]
}`;

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          },
          prompt
        ],
        config: { responseMimeType: 'application/json' }
      });

      const parsed = JSON.parse(aiResponse.text || '{}');

      if (!parsed.items || parsed.items.length === 0) {
        await sendMessage(chatId, '❌ Não consegui extrair os itens desta nota fiscal. Por favor, tente enviar outra foto mais nítida.', mainKeyboard);
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
      const requestsPayload = parsed.items.map((item: any) => ({
        order_id: order.id,
        user_id: profile.id,
        item_name: item.item_name,
        ingredient_id: item.ingredient_id || null,
        quantity: item.quantity,
        unit: item.unit || 'un',
        cost: item.cost || 0,
        destination: item.destination || 'danilo',
        status: 'pending',
        company_id: profile.company_id
      }));

      const { error: reqErr } = await supabase.from('purchase_requests').insert(requestsPayload);
      if (reqErr) throw reqErr;

      // Build preview message
      const itemsList = parsed.items.map((item: any) => {
        const mappingName = ingredients?.find(i => i.id === item.ingredient_id)?.name || '❌ Não Mapeado';
        return `• ${item.quantity} ${item.unit} - ${item.item_name} (R$ ${item.cost.toFixed(2)})\n  └─ Mapeado para: *${mappingName}*`;
      }).join('\n');

      const inlineKeyboard = {
        inline_keyboard: [
          [
            { text: '✅ Confirmar Entrada', callback_data: `confirm_purchase:${order.id}` },
            { text: '❌ Cancelar', callback_data: `cancel_purchase:${order.id}` }
          ]
        ]
      };

      await sendMessage(chatId, `📝 *Nota Fiscal Processada com Sucesso!*\n\n*Fornecedor:* ${parsed.supplier_name || 'Desconhecido'}\n*Valor Total:* R$ ${(parsed.total_value || 0).toFixed(2)}\n\n*Itens Extraídos:*\n${itemsList}\n\nDeseja confirmar a entrada deste pedido no estoque e lançar no financeiro?`, inlineKeyboard);

      await supabase.from('profiles').update({ telegram_state: null }).eq('id', profile.id);
      return res.status(200).send('OK');
    }

  } catch (error: any) {
    console.error('Webhook Error:', error);
    const chatId = req.body?.message?.chat?.id || req.body?.callback_query?.message?.chat?.id;
    if (chatId) {
      await sendMessage(chatId, `❌ *Erro ao processar requisição:*\n_${error.message || error}_`, mainKeyboard);
    }
  }

  return res.status(200).send('OK');
}
