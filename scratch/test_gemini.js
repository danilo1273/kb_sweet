import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config({ path: 'c:/Users/DANILO/Desktop/KBSWEET/.env' });

async function run() {
  console.log("Initializing Gemini...");
  console.log("API Key loaded:", process.env.GEMINI_API_KEY ? "Yes" : "No");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: ['Diga Olá Mundo em português.'],
    });
    console.log("Success! Response:", response.text);
  } catch (err) {
    console.error("Gemini failed:", err);
  }
}
run();
