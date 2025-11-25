const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey } = require('../config/env');
const { getRespostas } = require('../utils/respostaManager'); // Importa o gerenciador

const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// Prompt padrão caso você esqueça de configurar no site
const DEFAULT_PROMPT = "Você é um assistente virtual útil e educado.";

async function generateReply(history) {
  // 1. Busca o prompt atualizado do banco de dados
  const db = getRespostas();
  const systemPrompt = db['config_prompt'] || DEFAULT_PROMPT;

  // 2. Monta o histórico
  const historyText = history
    .map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`)
    .join('\n');

  // 3. Cria o contexto final
  const prompt = `${systemPrompt}\n\n${historyText}\nAssistente:`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return text.trim();
  } catch (error) {
    console.error("Erro na API Gemini:", error);
    throw error;
  }
}

module.exports = { generateReply };