const { generateReply } = require('../services/geminiService');
const { createAppointment, getAvailableSlots, findPendingAppointment, updateAppointmentStatus, getAllAppointments } = require('../services/localCalendarService');
const { logMessage } = require('../utils/logger');
const { addResposta, getRespostas } = require('../utils/respostaManager');
const { getHistory, saveHistory, loadMemory } = require('../utils/chatMemoryManager');
const { getState, setState, deleteState, loadState } = require('../utils/bookingStateManager');

const MAX_HISTORY = 15;
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

function isConfirmation(text) {
    const words = ['sim', 'confirmo', 'confirmado', 'ok', 'pode ser', 'ta', 'tá', 'isso', 'claro', 'pode'];
    const clean = normalize(text);
    return words.some(w => clean.includes(w));
}

async function handleIncomingMessage(client, message, io) {
  try {
    const from = message.from;
    if (message.isStatus || from.endsWith('@g.us') || message.fromMe) return;

    // --- LÓGICA DE ÁUDIO ---
    let mediaData = null;
    let text = (message.body || '').trim();

    // Verifica se é mensagem de voz/áudio
    if (message.hasMedia) {
        try {
            const media = await message.downloadMedia();
            if (media && (media.mimetype.startsWith('audio') || media.mimetype.includes('ogg'))) {
                mediaData = {
                    mimetype: media.mimetype,
                    data: media.data // Base64
                };
                text = "[Áudio Recebido]"; // Placeholder para o log e histórico
                console.log('🎤 Áudio recebido de', from);
            }
        } catch (err) {
            console.error('Erro ao baixar mídia:', err);
        }
    }

    // Se não tem texto nem áudio, ignora (ex: imagem sem legenda)
    if (!text && !mediaData) return;

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

    const norm = normalize(text);

    // ADMIN (Só processa comandos se for texto puro)
    if (!mediaData && norm.startsWith('!add ')) {
        const p = text.substring(5).split('=');
        if (p.length===2) { 
            await addResposta(p[0].trim(), p[1].trim()); 
            await replyAndLog(message, '✅ Salvo!'); 
        }
        return;
    }

    // 3. CONFIRMAÇÃO (Só funciona com texto por enquanto)
    const pendingApp = await findPendingAppointment(phone);
    if (!mediaData && pendingApp && isConfirmation(text)) {
        await updateAppointmentStatus(pendingApp.id, 'confirmado');
        if (io) io.emit('appointments_update', await getAllAppointments());

        const confirmMsg = `Maravilha! Seu horário está SUPER confirmado! ✅\nTe esperamos dia ${new Date(pendingApp.start).toLocaleDateString('pt-BR')} às ${new Date(pendingApp.start).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}.`;
        
        const history = getHistory(phone);
        history.push({ role: 'user', content: text });
        history.push({ role: 'assistant', content: confirmMsg });
        saveHistory(phone, history.slice(-MAX_HISTORY));
        
        await replyAndLog(message, confirmMsg);
        return;
    }

    // 4. IA (Processa Texto OU Áudio)
    const history = getHistory(phone);
    history.push({ role: 'user', content: text }); // Salva "[Áudio Recebido]" no histórico visual
    
    // Passa o audioData para o serviço
    let reply = await generateReply(history, phone, mediaData);

    // 5. JSON Action
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
                     reply = await generateReply(history, phone); // Tenta de novo sem áudio dessa vez
                } else {
                    const endIso = new Date(new Date(startIso).getTime() + duration*60000).toISOString();
                    
                    await createAppointment({
                        clientName: command.nome,
                        serviceName: command.servico,
                        clientPhone: phone, 
                        status: 'agendado', 
                        startDateTime: startIso, 
                        endDateTime: endIso
                    });
                    
                    if (io) io.emit('appointments_update', await getAllAppointments());

                    const confirm = `✅ *Agendado!* \n🗓️ ${new Date(startIso).toLocaleDateString('pt-BR')} às ${command.hora}\n✂️ ${command.servico}`;
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

    // 6. Resposta Texto Normal
    history.push({ role: 'assistant', content: reply });
    saveHistory(phone, history.slice(-MAX_HISTORY));
    await replyAndLog(message, reply);

  } catch (e) { console.error("FATAL:", e); }
}

module.exports = { handleIncomingMessage };