// ... (imports iguais aos anteriores)
const { generateReply } = require('../services/geminiService');
const { createAppointment, getAvailableSlots } = require('../services/localCalendarService');
const { logMessage } = require('../utils/logger');
const { addResposta, getRespostas } = require('../utils/respostaManager');
const { getHistory, saveHistory, loadMemory } = require('../utils/chatMemoryManager');
const { getState, setState, deleteState, loadState } = require('../utils/bookingStateManager');

const MAX_HISTORY = 50;
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
function cleanNumber(num) { return num.replace(/\D/g, ''); }

async function handleIncomingMessage(client, message) {
  try {
    const from = message.from;
    if (message.isStatus || from.endsWith('@g.us') || message.fromMe) return;

    const text = (message.body || '').trim();
    if (!text) return;

    const phone = cleanNumber(from); 
    
    await loadMemory(phone);
    await loadState(phone);
    const db = await getCachedDb(); 

    // 1. SEGURANÇA
    const allowedRaw = db['config_numeros'] || ''; 
    if (allowedRaw.trim()) {
        const allowedList = allowedRaw.split(',').map(n => cleanNumber(n));
        if (!allowedList.includes(phone)) {
            console.log(`🚫 Bloqueado: ${phone}`);
            return; 
        }
    }

    // 2. Limites
    resetUsageIfNewDay();
    const limitMsg = parseInt(db['config_limite_msg']) || 200;
    if (usage.messages >= limitMsg) return;

    logMessage('RECEBIDO', from, text);
    usage.messages++;

    // ADMIN
    const norm = normalize(text);
    if (norm.startsWith('!add ')) {
        const p = text.substring(5).split('=');
        if (p.length===2) { 
            await addResposta(p[0].trim(), p[1].trim()); 
            await replyAndLog(message, '✅ Salvo!'); 
        }
        return;
    }

    // 3. IA
    const history = getHistory(phone);
    history.push({ role: 'user', content: text });
    
    let reply = await generateReply(history, phone);

    // 4. JSON Action
    try {
        if (reply.trim().startsWith('{') && reply.trim().endsWith('}')) {
            const command = JSON.parse(reply);

            if (command.action === 'AGENDAR') {
                const startIso = `${command.data}T${command.hora}:00`;
                let duration = parseInt(db['config_duracao']) || 40;
                if(command.servico && command.servico.toLowerCase().includes('mechas')) duration = 120;

                const slots = await getAvailableSlots(command.data, { slotMinutes: duration });
                
                if (!slots.includes(command.hora)) {
                     const horariosLivres = slots.length > 0 ? slots.join(', ') : "Sem vagas hoje.";
                     const sysMsg = `Sistema: Horário ${command.hora} indisponível. Livres: [ ${horariosLivres} ].`;
                     history.push({ role: 'user', content: sysMsg });
                     reply = await generateReply(history, phone); 
                } else {
                    const endIso = new Date(new Date(startIso).getTime() + duration*60000).toISOString();
                    
                    // --- SALVANDO CORRETAMENTE ---
                    await createAppointment({
                        clientName: command.nome,     // Nome extraído pela IA
                        serviceName: command.servico, // Serviço extraído pela IA
                        clientPhone: phone,           // Número do WhatsApp
                        startDateTime: startIso, 
                        endDateTime: endIso
                    });

                    const confirm = `✅ *Agendamento Realizado!* \n\n👤 ${command.nome}\n🗓️ ${new Date(startIso).toLocaleDateString('pt-BR')} às ${command.hora}\n✂️ ${command.servico}\n\nStatus: Agendado`;
                    history.push({ role: 'assistant', content: confirm });
                    saveHistory(phone, history.slice(-MAX_HISTORY));
                    await replyAndLog(message, confirm);
                    return;
                }
            }
        }
    } catch (jsonError) {
        console.error("Erro JSON IA:", jsonError);
    }

    // 5. Resposta Texto
    history.push({ role: 'assistant', content: reply });
    saveHistory(phone, history.slice(-MAX_HISTORY));
    await replyAndLog(message, reply);

  } catch (e) { console.error("FATAL:", e); }
}

module.exports = { handleIncomingMessage };