import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verifica se a requisição é do tipo POST (que é o que o Telegram envia)
  if (req.method === 'POST') {
    const message = req.body.message;
    
    // Log para você verificar no painel da Vercel o que chegou
    console.log('Mensagem recebida do Telegram:', message?.text);
    
    // Responde ao Telegram que recebeu a mensagem com sucesso
    return res.status(200).send('OK');
  }
  
  // Resposta padrão caso alguém acesse o link no navegador
  return res.status(200).send('Webhook ativo');
}

