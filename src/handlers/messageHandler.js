const { generateReply } = require('../services/geminiService');
const { createAppointment, getAvailableSlots } = require('../services/localCalendarService');
const { logMessage } = require('../utils/logger');
const { addResposta, getRespostas } = require('../utils/respostaManager');
const { getHistory, saveHistory } = require('../utils/chatMemoryManager');

const MAX_HISTORY = 15;

// Controle diário
let usage = { date: new Date().toISOString().slice(0, 10), messages: 0 };
function resetUsage() {
  const today = new Date().toISOString().slice(0, 10);
  if (usage.date !== today) usage = { date: today, messages: 0 };
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
    const db = getRespostas(); 

    // 1. Segurança
    const allowed = db['config_numeros'] || ''; 
    if (allowed.trim()) {
        const list = allowed.split(',').map(n => n.trim());
        if (!list.includes(phone)) return; 
    }

    resetUsage();
    const limitMsg = parseInt(db['config_limite_msg']) || 200;
    if (usage.messages >= limitMsg) return;

    logMessage('RECEBIDO', from, text);
    usage.messages++;

    const norm = normalize(text);

    // 2. Admin Rápido
    if (norm.startsWith('!add ')) {
        const p = text.substring(5).split('=');
        if (p.length===2) { 
            addResposta(p[0].trim(), p[1].trim()); 
            await replyAndLog(message, '✅ Salvo!'); 
        }
        return;
    }

    // 3. Cérebro da IA
    const history = getHistory(from);
    history.push({ role: 'user', content: text });

    // Envia para o Gemini 2.0
    let reply = await generateReply(history, phone);

    // 4. Verifica Ação JSON
    try {
        if (reply.trim().startsWith('{') && reply.trim().endsWith('}')) {
            const command = JSON.parse(reply);

            if (command.action === 'AGENDAR') {
                const startIso = `${command.data}T${command.hora}:00`;
                
                // Verifica disponibilidade real
                const slots = await getAvailableSlots(command.data, { slotMinutes: 40 });
                
                // Se horário ocupado (não está na lista de livres)
                if (!slots.includes(command.hora)) {
                    history.push({ role: 'user', content: `Sistema: Horário ${command.hora} ocupado. Peça outro.` });
                    reply = await generateReply(history, phone); // Tenta de novo
                } else {
                    // Livre -> Agendar
                    const endIso = new Date(new Date(startIso).getTime() + 40*60000).toISOString();
                    await createAppointment({
                        summary: `${command.servico} - ${command.nome}`,
                        description: `Via Bot\nTel: ${phone}`,
                        startDateTime: startIso,
                        endDateTime: endIso
                    });

                    const confirm = `✅ *Agendado!* \n🗓️ ${new Date(startIso).toLocaleDateString('pt-BR')} às ${command.hora}\n✂️ ${command.servico}`;
                    history.push({ role: 'assistant', content: confirm });
                    saveHistory(from, history.slice(-MAX_HISTORY));
                    await replyAndLog(message, confirm);
                    return;
                }
            }
        }
    } catch (jsonError) {
        // Não era JSON, segue o fluxo normal
    }

    // 5. Resposta Texto Normal
    history.push({ role: 'assistant', content: reply });
    saveHistory(from, history.slice(-MAX_HISTORY));
    await replyAndLog(message, reply);

  } catch (e) { 
    console.error("FATAL:", e); 
  }
}

module.exports = { handleIncomingMessage };