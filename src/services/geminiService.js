const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey } = require('../config/env');
const { getRespostas } = require('../utils/respostaManager');

const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }); 

// Adicionado parâmetro 'audioData'
async function generateReply(history, userPhone, audioData = null) {
  const db = await getRespostas();
  
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
2. Se receber um áudio, ouça e responda naturalmente como se fosse texto.
3. Colete: **Nome**, **Serviço**, **Data (AAAA-MM-DD)** e **Horário (HH:mm)**.
4. **IMPORTANTE:** Quando tiver TODOS os 4 dados, NÃO responda texto. Responda APENAS este JSON:

{
  "action": "AGENDAR",
  "nome": "Nome do Cliente",
  "servico": "Nome do Serviço",
  "data": "YYYY-MM-DD",
  "hora": "HH:mm"
}

5. Se a data for vaga (ex: "hoje"), use a data de hoje para calcular.
`;

  // Constrói o histórico para o Gemini
  // O primeiro item é o System Prompt
  const contents = [
    { role: 'user', parts: [{ text: promptFinal }] }
  ];

  // Adiciona o histórico anterior (exceto a última mensagem que vamos tratar agora)
  const pastHistory = history.slice(0, -1);
  pastHistory.forEach(m => {
      contents.push({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
      });
  });

  // Trata a mensagem atual (Última do array history)
  const lastMsg = history[history.length - 1];
  const currentParts = [];

  // Se tiver áudio, adiciona o blob
  if (audioData) {
      currentParts.push({
          inlineData: {
              mimeType: audioData.mimetype,
              data: audioData.data
          }
      });
      currentParts.push({ text: "O cliente enviou este áudio. Responda ao conteúdo dele." });
  } else {
      // Se for só texto
      currentParts.push({ text: lastMsg.content });
  }

  contents.push({
      role: 'user',
      parts: currentParts
  });

  try {
    const result = await model.generateContent({
      contents: contents,
      generationConfig: { temperature: 0.0 }
    });
    
    const text = result.response.text().trim();
    return text.replace(/```json|```/g, '').trim();
  } catch (error) {
    console.error("Erro Gemini:", error.message);
    return "Desculpe, não consegui entender. Pode repetir?";
  }
}

module.exports = { generateReply };