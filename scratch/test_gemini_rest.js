import dotenv from 'dotenv';
dotenv.config({ path: 'c:/Users/DANILO/Desktop/KBSWEET/.env' });

async function generateContentREST(prompt, model = 'gemini-2.5-flash', fileData) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const parts = [];
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
  const timeoutId = setTimeout(() => controller.abort(), 5000);

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
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Tempo limite de 5s excedido para o modelo ${model}`);
    }
    throw err;
  }
}

async function run() {
  console.log("Calling REST with AbortController...");
  try {
    const text = await generateContentREST("Diga Olá Mundo em português.");
    console.log("Success! Response:", text);
  } catch (err) {
    console.error("Failed:", err);
  }
}
run();
