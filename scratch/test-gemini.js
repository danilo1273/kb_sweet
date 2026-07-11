import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load .env
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log('Testing with API Key starting with:', apiKey ? apiKey.substring(0, 10) : 'undefined');

async function test() {
  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.5-flash'];
  
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hello' }] }]
        })
      });
      
      console.log(`Model: ${model} - Status:`, response.status);
      const text = await response.text();
      if (response.status !== 200) {
        console.log(`  Error:`, text.substring(0, 200));
      } else {
        console.log(`  Success!`);
      }
    } catch (err) {
      console.error(`Model: ${model} - Request failed:`, err.message);
    }
  }
}

test();
