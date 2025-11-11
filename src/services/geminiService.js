// src/services/geminiService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey, systemPrompt } = require('../config/env');

const genAI = new GoogleGenerativeAI(geminiApiKey);

// modelo econômico, rápido e barato
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

async function generateReply(history) {
  // Junta histórico em um prompt único
  const historyText = history
    .map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`)
    .join('\n');

  const prompt = `${systemPrompt}\n\n${historyText}\nAssistente:`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return text.trim();
}

module.exports = { generateReply };