const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey } = require('../config/env');
const { getRespostas } = require('../utils/respostaManager');

const genAI = new GoogleGenerativeAI(geminiApiKey);

// Usando a versão que você confirmou que funciona
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }); 

async function generateReply(history, userPhone) {
  const db = getRespostas();
  
  const now = new Date();
  const todayInfo = `Hoje é: ${now.toLocaleDateString('pt-BR', { weekday: 'long' })}, ${now.toLocaleDateString('pt-BR')} - Hora atual: ${now.toLocaleTimeString('pt-BR')}`;
  
  const knowledgeBase = Object.entries(db)
    .filter(([k]) => !k.startsWith('config_'))
    .map(([k, v]) => `[${k}]: ${v}`)
    .join('\n');

  const systemPrompt = db['config_prompt'] || "Você é um assistente útil.";

  const promptFinal = `
${systemPrompt}

=== DADOS DO SISTEMA ===
${todayInfo}
Número do Cliente: ${userPhone}

=== BASE DE CONHECIMENTO ===
${knowledgeBase}

=== SUAS INSTRUÇÕES (CRÍTICO) ===
1. Seu objetivo é agendar horários ou tirar dúvidas.
2. Colete: **Nome**, **Serviço**, **Data (AAAA-MM-DD)** e **Horário (HH:mm)**.
3. **IMPORTANTE:** Quando tiver TODOS os 4 dados, NÃO responda texto. Responda APENAS este JSON:

{
  "action": "AGENDAR",
  "nome": "Nome do Cliente",
  "servico": "Nome do Serviço",
  "data": "YYYY-MM-DD",
  "hora": "HH:mm"
}

4. Se a data for vaga (ex: "hoje"), use a data de hoje para calcular.
5. Responda de forma curta e natural enquanto coleta dados.
`;

  // Injeta o prompt na primeira mensagem para garantir obediência
  const chatHistory = [
    { role: 'user', parts: [{ text: promptFinal }] },
    ...history.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
    }))
  ];

  try {
    const result = await model.generateContent({
      contents: chatHistory,
      generationConfig: {
        temperature: 0.7, 
      }
    });
    
    const text = result.response.text().trim();
    const cleanText = text.replace(/```json|```/g, '').trim();

    return cleanText;
  } catch (error) {
    console.error("Erro Gemini:", error.message);
    return "Desculpe, tive um lapso de memória. Pode repetir?";
  }
}

module.exports = { generateReply };