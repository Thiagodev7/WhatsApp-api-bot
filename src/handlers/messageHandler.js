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

function normalize(text) { return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

async function handleIncomingMessage(client, message) {
  try {
    const from = message.from;
    if (message.isStatus || from.endsWith('@g.us') || message.fromMe) return;

    const text = (message.body || '').trim();
    if (!text) return;

    const phone = from.replace('@c.us', '');
    
    // CARREGA MEMÓRIA
    await loadMemory(phone);
    await loadState(phone);

    const db = await getCachedDb(); 

    // 1. Segurança
    const allowed = db['config_numeros'] || ''; 
    if (allowed.trim()) {
        const list = allowed.split(',').map(n => n.trim());
        if (!list.includes(phone)) return; 
    }

    // 2. Limites
    resetUsageIfNewDay();
    const limitMsg = parseInt(db['config_limite_msg']) || 200;
    if (usage.messages >= limitMsg) return;

    logMessage('RECEBIDO', from, text);
    usage.messages++;

    const norm = normalize(text);
    let state = getState(from);

    // GATILHOS DE ADMIN
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

    // 4. Verifica Ação JSON
    try {
        if (reply.trim().startsWith('{') && reply.trim().endsWith('}')) {
            const command = JSON.parse(reply);

            if (command.action === 'AGENDAR') {
                const startIso = `${command.data}T${command.hora}:00`;
                
                // --- ALTERAÇÃO: Pega duração do banco ou usa 40 como fallback ---
                let duration = parseInt(db['config_duracao']) || 40;
                
                // Lógica extra para serviços específicos (opcional)
                if(command.servico && command.servico.toLowerCase().includes('mechas')) duration = 120;

                // Verifica disponibilidade no banco (passando a duração correta)
                const slots = await getAvailableSlots(command.data, { slotMinutes: duration });
                
                // SE O HORÁRIO ESTIVER OCUPADO OU INVÁLIDO
                if (!slots.includes(command.hora)) {
                     const horariosLivres = slots.length > 0 ? slots.join(', ') : "Nenhum horário livre para este dia.";
                     const sysMsg = `Sistema: O horário ${command.hora} NÃO está disponível (ocupado ou passado). Horários livres: [ ${horariosLivres} ]. Peça para escolher outro.`;
                     
                     history.push({ role: 'user', content: sysMsg });
                     console.log("⚠️ Conflito de horário. Avisando IA:", sysMsg);
                     
                     // Nova tentativa com a IA
                     reply = await generateReply(history, phone); 

                } else {
                    // Horário LIVRE -> Agendar
                    const endIso = new Date(new Date(startIso).getTime() + duration*60000).toISOString();
                    
                    await createAppointment({
                        summary: `${command.servico} - ${command.nome}`,
                        description: `Via Bot\nTel: ${phone}`,
                        startDateTime: startIso, 
                        endDateTime: endIso
                    });

                    const confirm = `✅ *Agendado com Sucesso!* \n\n🗓️ Data: ${new Date(startIso).toLocaleDateString('pt-BR')}\n⏰ Horário: ${command.hora}\n✂️ Serviço: ${command.servico}\n\nTe aguardamos!`;
                    
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