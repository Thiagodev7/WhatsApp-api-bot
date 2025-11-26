const { generateReply } = require('../services/geminiService');
const { createAppointment, getAvailableSlots } = require('../services/localCalendarService');
const { logMessage } = require('../utils/logger');
const { addResposta, getRespostas } = require('../utils/respostaManager');

// IMPORTS CORRIGIDOS (Apenas uma vez)
const { getHistory, saveHistory, loadMemory } = require('../utils/chatMemoryManager');
const { getState, setState, deleteState, loadState } = require('../utils/bookingStateManager');

const MAX_HISTORY = 15;
const DEFAULT_DURATION = 40;

// Cache de configurações (Performance)
let dbCache = null;
let lastDbUpdate = 0;

async function getCachedDb() {
  const now = Date.now();
  if (!dbCache || (now - lastDbUpdate > 5000)) { // Atualiza a cada 5s
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

function parseDateFromText(text) {
  const norm = normalize(text);
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (norm.includes('hoje')) return { date: base };
  if (norm.includes('amanha')) { const d = new Date(base); d.setDate(d.getDate() + 1); return { date: d }; }

  const match = norm.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    let year = match[3] ? parseInt(match[3], 10) : base.getFullYear();
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime()) && d.getMonth() === month) return { date: d };
  }
  return null;
}

function formatDateYMD(date) { return date.toISOString().split('T')[0]; }
function formatDateBR(date) { return date.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}); }

// --- MAIN HANDLER ---
async function handleIncomingMessage(client, message) {
  try {
    const from = message.from;
    if (message.isStatus || from.endsWith('@g.us') || message.fromMe) return;

    const text = (message.body || '').trim();
    if (!text) return;

    const phone = from.replace('@c.us', '');
    
    // --- CARREGA MEMÓRIA DO BANCO (NOVO) ---
    await loadMemory(phone);
    await loadState(phone);
    // ---------------------------------------

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
    usage.messages++; usage.chars += text.length;

    const norm = normalize(text);
    let state = getState(from);

    // FLUXO DE AGENDAMENTO
    if (state) {
      if (state.step === 'ask_name') {
        state.name = text; state.step = 'ask_service'; setState(from, state);
        await replyAndLog(message, `Olá, ${state.name}! 👋\nQual serviço você deseja? (ex: Corte, Barba...)`);
        return;
      }

      if (state.step === 'ask_service') {
        state.service = text; state.step = 'ask_date';
        let duration = DEFAULT_DURATION;
        const foundKey = Object.keys(db).find(k => norm.includes(k) && !k.startsWith('config_'));
        if (foundKey) {
          const m = db[foundKey].match(/(\d+)\s*(min|minutos)/i);
          if (m?.[1]) duration = parseInt(m[1], 10);
        }
        state.duration = duration; setState(from, state);
        await replyAndLog(message, `Entendido! Para qual dia você prefere? 🗓️\n(Ex: "hoje", "amanhã" ou "25/11")`);
        return;
      }

      if (state.step === 'ask_date') {
        const parsed = parseDateFromText(text);
        if (!parsed) { await replyAndLog(message, 'Data inválida. Tente "hoje" ou "12/12".'); return; }
        
        const dateObj = parsed.date;
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        if (dateObj < hoje) { await replyAndLog(message, 'Essa data já passou! Escolha uma futura.'); return; }

        const iso = formatDateYMD(dateObj);
        const br = formatDateBR(dateObj);

        try {
          const slots = await getAvailableSlots(iso, { slotMinutes: state.duration || DEFAULT_DURATION });
          if (!slots.length) { await replyAndLog(message, `Dia ${br} está lotado! Tente outro dia.`); return; }

          state.dateIso = iso; state.dateBr = br; state.slots = slots; state.step = 'ask_time'; setState(from, state);
          await replyAndLog(message, `Horários livres em ${br}:\n\n${slots.join(', ')}\n\nQual você prefere?`);
        } catch (err) {
          console.error(err); await replyAndLog(message, 'Erro na agenda. Tente novamente.');
        }
        return;
      }

      if (state.step === 'ask_time') {
        const chosen = text.trim().match(/(\d{1,2}:\d{2})/) ? text.trim().match(/(\d{1,2}:\d{2})/)[0] : text.trim();
        if (!state.slots.includes(chosen)) { await replyAndLog(message, 'Horário inválido. Escolha um da lista.'); return; }

        const startIso = `${state.dateIso}T${chosen}:00`;
        const endIso = new Date(new Date(startIso).getTime() + (state.duration || 40)*60000).toISOString();

        try {
          await createAppointment({
            summary: `${state.service} - ${state.name}`,
            description: `Via Bot\nTel: ${phone}`,
            startDateTime: startIso,
            endDateTime: endIso
          });
          await replyAndLog(message, `✅ Agendado!\n\n👤 ${state.name}\n✂️ ${state.service}\n🗓️ ${state.dateBr} às ${chosen}`);
          deleteState(from);
        } catch (e) { await replyAndLog(message, 'Erro ao salvar.'); }
        return;
      }
    }

    // GATILHOS
    if (['agendar','marcar','agenda'].some(t => norm.includes(t))) {
      setState(from, { step: 'ask_name' });
      await replyAndLog(message, 'Vamos agendar! Qual seu nome?');
      return;
    }
    
    if (state && (norm==='cancelar'||norm==='sair')) { deleteState(from); await replyAndLog(message, 'Cancelado.'); return; }

    // ADMIN
    if (norm.startsWith('!add ')) {
        const p = text.substring(5).split('=');
        if (p.length===2) { 
            const { addResposta } = require('../utils/respostaManager');
            await addResposta(p[0].trim(), p[1].trim()); 
            await replyAndLog(message, '✅ Salvo!'); 
        }
        return;
    }

    // IA
    const history = getHistory(from);
    history.push({ role: 'user', content: text });
    
    // Envia para o Gemini
    let reply = await generateReply(history, phone);

    // Verifica JSON de Agendamento Automático da IA
    try {
        if (reply.trim().startsWith('{') && reply.trim().endsWith('}')) {
            const command = JSON.parse(reply);
            if (command.action === 'AGENDAR') {
                const startIso = `${command.data}T${command.hora}:00`;
                
                // Verifica disponibilidade
                const slots = await getAvailableSlots(command.data, { slotMinutes: 40 });
                
                if (!slots.includes(command.hora)) {
                     history.push({ role: 'user', content: `Sistema: Horário ${command.hora} ocupado. Peça outro.` });
                     reply = await generateReply(history, phone); 
                } else {
                    const endIso = new Date(new Date(startIso).getTime() + 40*60000).toISOString();
                    await createAppointment({
                        summary: `${command.servico} - ${command.nome}`,
                        description: `Via Bot\nTel: ${phone}`,
                        startDateTime: startIso, endDateTime: endIso
                    });
                    const confirm = `✅ Agendado!\n🗓️ ${new Date(startIso).toLocaleDateString('pt-BR')} às ${command.hora}\n✂️ ${command.servico}`;
                    history.push({ role: 'assistant', content: confirm });
                    saveHistory(from, history.slice(-MAX_HISTORY));
                    await replyAndLog(message, confirm);
                    return;
                }
            }
        }
    } catch (jsonError) {}

    // Resposta Texto
    history.push({ role: 'assistant', content: reply });
    saveHistory(from, history.slice(-MAX_HISTORY));
    await replyAndLog(message, reply);

  } catch (e) { console.error("FATAL:", e); }
}

module.exports = { handleIncomingMessage };