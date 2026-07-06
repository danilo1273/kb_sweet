import dotenv from 'dotenv';
dotenv.config({ path: 'c:/Users/DANILO/Desktop/KBSWEET/.env' });

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  let url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  
  while (url) {
    const response = await fetch(url);
    const data = await response.json();
    if (data.models) {
      for (const m of data.models) {
        if (m.supportedGenerationMethods.includes("generateContent")) {
          console.log(m.name);
        }
      }
    }
    url = data.nextPageToken 
      ? `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageToken=${data.nextPageToken}`
      : null;
  }
}

listModels();
