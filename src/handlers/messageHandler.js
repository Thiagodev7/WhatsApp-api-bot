const { generateReply } = require('../services/geminiService');
const { createAppointment, getAvailableSlots } = require('../services/localCalendarService');
const { logMessage } = require('../utils/logger');
const { addResposta, getRespostas } = require('../utils/respostaManager');
const { getHistory, saveHistory, loadMemory } = require('../utils/chatMemoryManager');
const { getState, setState, deleteState, loadState } = require('../utils/bookingStateManager');

const MAX_HISTORY = 15;

// --- CACHE DE CONFIGURAÇÕES ---
let dbCache = null;
let lastDbUpdate = 0;

async function getCachedDb() {
  const now = Date.now();
  if (!dbCache || (now - lastDbUpdate > 5000)) { 
    dbCache = await getRespostas();
    lastDbUpdate = now;
  }
  return dbCache;
}

let usage = { date: new Date().toISOString().slice(0, 10), messages: 0, chars: 0 };

function resetUsageIfNewDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (usage.date !== today) usage = { date: today, messages: 0, chars: 0 };
}

async function replyAndLog(message, text) {
  try { await message.reply(text); logMessage('RESPONDIDO', message.from, text); }
  catch (e) { console.error('Erro envio:', e); }
}

// Remove acentos e deixa minúsculo
function normalize(text) { return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

// Remove tudo que não for número (para comparar telefones corretamente)
function cleanNumber(num) { return num.replace(/\D/g, ''); }

async function handleIncomingMessage(client, message) {
  try {
    const from = message.from;
    if (message.isStatus || from.endsWith('@g.us') || message.fromMe) return;

    const text = (message.body || '').trim();
    if (!text) return;

    const phone = from.replace('@c.us', ''); // Ex: 5511999999999
    
    // CARREGA MEMÓRIA
    await loadMemory(phone);
    await loadState(phone);

    const db = await getCachedDb(); 

    // 1. SEGURANÇA (WHITELIST)
    // Se houver números configurados, só responde a eles.
    const allowedRaw = db['config_numeros'] || ''; 
    if (allowedRaw.trim()) {
        // Limpa a lista (remove traços, espaços, parênteses) para comparar apenas números
        const allowedList = allowedRaw.split(',').map(n => cleanNumber(n));
        
        // Se o telefone de quem mandou msg NÃO estiver na lista, IGNORA (return)
        if (!allowedList.includes(phone)) {
            console.log(`🚫 Bloqueado: ${phone} não está na lista de permitidos.`);
            return; 
        }
    }

    // 2. Limites Diários
    resetUsageIfNewDay();
    const limitMsg = parseInt(db['config_limite_msg']) || 200;
    if (usage.messages >= limitMsg) return;

    logMessage('RECEBIDO', from, text);
    usage.messages++;

    const norm = normalize(text);
    let state = getState(from);

    // GATILHOS DE ADMIN (!add chave = valor)
    if (norm.startsWith('!add ')) {
        const p = text.substring(5).split('=');
        if (p.length===2) { 
            const { addResposta } = require('../utils/respostaManager');
            await addResposta(p[0].trim(), p[1].trim()); 
            await replyAndLog(message, '✅ Salvo!'); 
        }
        return;
    }

    // 3. Cérebro da IA
    const history = getHistory(from);
    history.push({ role: 'user', content: text });
    
    // Envia para o Gemini
    let reply = await generateReply(history, phone);

    // 4. Verifica Ação JSON (Agendamento)
    try {
        if (reply.trim().startsWith('{') && reply.trim().endsWith('}')) {
            const command = JSON.parse(reply);

            if (command.action === 'AGENDAR') {
                const startIso = `${command.data}T${command.hora}:00`;
                
                // Pega duração do banco ou usa 40 min padrão
                let duration = parseInt(db['config_duracao']) || 40;
                
                // Exemplo de exceção para serviços demorados
                if(command.servico && command.servico.toLowerCase().includes('mechas')) duration = 120;

                // Verifica disponibilidade
                const slots = await getAvailableSlots(command.data, { slotMinutes: duration });
                
                if (!slots.includes(command.hora)) {
                     const horariosLivres = slots.length > 0 ? slots.join(', ') : "Sem horários livres.";
                     const sysMsg = `Sistema: O horário ${command.hora} está ocupado, passado ou inválido. Horários livres: [ ${horariosLivres} ]. Peça para escolher outro.`;
                     
                     history.push({ role: 'user', content: sysMsg });
                     console.log("⚠️ Conflito de horário. Avisando IA.");
                     
                     // Tenta gerar nova resposta com o aviso de erro
                     reply = await generateReply(history, phone); 
                } else {
                    // Agendar
                    const endIso = new Date(new Date(startIso).getTime() + duration*60000).toISOString();
                    
                    await createAppointment({
                        summary: `${command.servico} - ${command.nome}`,
                        description: `Via Bot\nTel: ${phone}`,
                        startDateTime: startIso, 
                        endDateTime: endIso
                    });

                    const confirm = `✅ *Agendado com Sucesso!* \n\n🗓️ Data: ${new Date(startIso).toLocaleDateString('pt-BR')}\n⏰ Horário: ${command.hora}\n✂️ Serviço: ${command.servico}`;
                    
                    history.push({ role: 'assistant', content: confirm });
                    saveHistory(from, history.slice(-MAX_HISTORY));
                    await replyAndLog(message, confirm);
                    return;
                }
            }
        }
    } catch (jsonError) {
        console.error("Erro processando JSON da IA:", jsonError);
    }

    // 5. Resposta Texto Normal
    history.push({ role: 'assistant', content: reply });
    saveHistory(from, history.slice(-MAX_HISTORY));
    await replyAndLog(message, reply);

  } catch (e) { console.error("FATAL:", e); }
}

module.exports = { handleIncomingMessage };