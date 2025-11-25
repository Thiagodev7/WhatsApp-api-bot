// src/handlers/messageHandler.js
const { generateReply } = require('../services/geminiService');
const { createAppointment, getAvailableSlots } = require('../services/calendarService');
const { logMessage } = require('../utils/logger');

// GESTORES DE DADOS
const { 
  addResposta, 
  removeResposta, 
  listRespostas, 
  getRespostas 
} = require('../utils/respostaManager');

const { getHistory, saveHistory } = require('../utils/chatMemoryManager');
const { getState, setState, deleteState } = require('../utils/bookingStateManager');

const MAX_HISTORY = 6;
const DEFAULT_DURATION = 40; // Duração padrão em minutos

// Controle de uso em memória (reseta se o servidor reiniciar, mas tem validação de data)
let usage = {
  date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
  messages: 0,
  chars: 0,
};

function resetUsageIfNewDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (usage.date !== today) {
    usage = {
      date: today,
      messages: 0,
      chars: 0,
    };
  }
}

// Helper para responder e logar
async function replyAndLog(message, text) {
  await message.reply(text);
  logMessage('RESPONDIDO', message.from, text);
}

// Normaliza texto (remove acentos)
function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Helper de datas
function parseDateFromText(text) {
  const norm = normalize(text);
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (norm.includes('hoje')) {
    return { date: base };
  }

  if (norm.includes('amanha')) {
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + 1);
    return { date: d };
  }

  const match = norm.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    let year = match[3] ? parseInt(match[3], 10) : base.getFullYear();
    if (year < 100) year += 2000;

    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return { date: d };
    }
  }
  return null;
}

function formatDateYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateBR(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}`;
}

/**
 * Função Principal que recebe cada mensagem
 */
async function handleIncomingMessage(client, message) {
  const from = message.from;

  if (message.isStatus) return;
  if (from.endsWith('@g.us')) return; // Ignora grupos
  if (message.fromMe) return;

  const text = (message.body || '').trim();
  if (!text) return;

  const phone = from.replace('@c.us', '');

  // --- [NOVO] VALIDAÇÃO DE SEGURANÇA VIA BANCO DE DADOS ---
  const db = getRespostas();
  
  // 1. Números Permitidos (Whitelist)
  // Se a chave 'config_numeros' existir no site, ativamos o bloqueio.
  const allowedString = db['config_numeros'] || ''; 
  if (allowedString && allowedString.trim() !== '') {
      const allowedList = allowedString.split(',').map(n => n.trim());
      if (!allowedList.includes(phone)) {
          console.log(`🚫 Bloqueado: ${phone} tentou falar mas não está na lista.`);
          return; // Ignora a mensagem
      }
  }

  // 2. Limites Diários Configuráveis
  const limitMsg = parseInt(db['config_limite_msg']) || 200;
  const limitChar = parseInt(db['config_limite_char']) || 20000;
  // --------------------------------------------------------

  logMessage('RECEBIDO', from, text);
  console.log(`📩 ${from}: ${text}`);

  const norm = normalize(text);
  let state = getState(from);

  // ================== 1. FLUXO DE AGENDAMENTO ==================
  if (state) {
    // 1) Pegando NOME
    if (state.step === 'ask_name') {
      state.name = text;
      state.step = 'ask_service';
      setState(from, state);
      await replyAndLog(
        message,
        `Perfeito, ${state.name}! ✂️\nQual serviço você deseja fazer? (ex: corte masculino, barba, tintura...)`
      );
      return;
    }

    // 2) Pegando SERVIÇO
    if (state.step === 'ask_service') {
      state.service = text;
      state.step = 'ask_date';

      // Tenta achar a duração configurada no "Conhecimento"
      const respostas = getRespostas(); 
      let duration = DEFAULT_DURATION; 
      let foundDuration = false;

      const foundKey = Object.keys(respostas).find(key => norm.includes(key));
      if (foundKey) {
        const info = respostas[foundKey]; 
        const match = info.match(/(\d+)\s*(min|minutos)/i); 
        if (match && match[1]) {
          duration = parseInt(match[1], 10);
          foundDuration = true;
        }
      }

      state.duration = duration;
      console.log(`[Agendamento] Serviço: "${state.service}", Duração: ${duration} min`);

      setState(from, state);
      await replyAndLog(
        message,
        `Ótimo! Para qual dia você prefere? (ex: "hoje", "amanhã" ou "15/12")`
      );
      return;
    }

    // 3) Pegando DATA
    if (state.step === 'ask_date') {
      const parsed = parseDateFromText(text);
      if (!parsed) {
        await replyAndLog(message, 'Não entendi a data 😕\nTente algo como "hoje", "amanhã" ou "12/11".');
        return;
      }

      const dateObj = parsed.date;
      const iso = formatDateYMD(dateObj);
      const br = formatDateBR(dateObj);

      try {
        const durationInMinutes = state.duration || DEFAULT_DURATION;
        
        // Busca slots livres no Google Calendar
        const slots = await getAvailableSlots(iso, {
          slotMinutes: durationInMinutes, 
          workStart: '09:00',
          workEnd: '18:00',
        });

        if (!slots.length) {
          await replyAndLog(
            message,
            `Poxa, dia ${br} estamos sem horários livres para esse serviço (${durationInMinutes} min). Tente outra data.`
          );
          return;
        }

        state.dateIso = iso;
        state.dateBr = br;
        state.slots = slots;
        state.step = 'ask_time';
        setState(from, state);

        const slotsStr = slots.join(', ');
        await replyAndLog(
          message,
          `Para dia ${br}, tenho estes horários:\n\n${slotsStr}\n\nQual você prefere? (Responda só a hora, ex: 15:00)`
        );
      } catch (err) {
        console.error('Erro calendar:', err);
        await replyAndLog(message, 'Tive um erro ao consultar a agenda. Tente de novo daqui a pouco.');
      }
      return;
    }

    // 4) Pegando HORÁRIO e finalizando
    if (state.step === 'ask_time') {
      const chosen = text.trim();
      const slots = state.slots || [];
      
      // Validação simples de horário
      if (!slots.some(s => chosen.includes(s))) {
        await replyAndLog(message, `Esse horário não está na lista. Escolha um dos disponíveis acima.`);
        return;
      }

      const dateIso = state.dateIso;
      
      // Monta datas ISO para o Google
      const startDateTime = `${dateIso}T${chosen}:00-03:00`;
      const start = new Date(startDateTime); 
      const durationInMinutes = state.duration || DEFAULT_DURATION; 
      const end = new Date(start.getTime()); 
      end.setMinutes(start.getMinutes() + durationInMinutes); 

      const endYear = end.getFullYear();
      const endMonth = String(end.getMonth() + 1).padStart(2, '0');
      const endDay = String(end.getDate()).padStart(2, '0');
      const endHour = String(end.getHours()).padStart(2, '0');
      const endMinute = String(end.getMinutes()).padStart(2, '0');
      const endIso = `${endYear}-${endMonth}-${endDay}T${endHour}:${endMinute}:00-03:00`;

      const summary = `${state.service} - ${state.name}`;
      const description = `Agendamento via Bot.\nCliente: ${state.name}\nServiço: ${state.service}\nTel: ${phone}`;

      try {
        await createAppointment({
          summary,
          description,
          startDateTime,
          endDateTime: endIso, 
        });

        await replyAndLog(
          message,
          `✅ Agendado com sucesso, ${state.name}!\n\n🗓️ *${state.dateBr} às ${chosen}*\n✂️ *${state.service}*\n\nTe esperamos!`
        );
        deleteState(from); // Limpa o estado
      } catch (err) {
        console.error('Erro ao criar evento:', err);
        await replyAndLog(message, '⚠️ Erro ao salvar na agenda. Tente novamente.');
      }
      return;
    }
  }

  // ================== 2. GATILHOS DE NOVO AGENDAMENTO ==================
  const bookingTriggers = [
    'agendar', 'marcar', 'horario', 'agenda', 'disponivel', 'vaga', 'corte'
  ];

  if (bookingTriggers.some(trigger => norm.includes(trigger))) {
    const newState = { step: 'ask_name' };
    setState(from, newState);
    await replyAndLog(message, 'Claro, vamos agendar! Primeiro, qual o seu nome?');
    return;
  }

  // ================== 3. COMANDOS DE ADMINISTRAÇÃO ==================
  if (norm === '!ping') {
    await replyAndLog(message, '🏓 Pong! O sistema THIAGO.AI está online.');
    return;
  }

  if (norm.startsWith('!listar')) {
    const lista = listRespostas();
    const textList = lista.length ? lista.join('\n') : 'Nenhuma informação cadastrada.';
    await replyAndLog(message, `📚 *Conhecimento Atual:*\n\n${textList}`);
    return;
  }

  if (norm.startsWith('!adicionar ')) {
    const parts = text.substring(11).split('=');
    if (parts.length < 2) {
      await replyAndLog(message, 'Use: !adicionar gatilho = resposta');
      return;
    }
    addResposta(parts[0].trim(), parts.slice(1).join('=').trim());
    await replyAndLog(message, '✅ Informação salva no cérebro da IA.');
    return;
  }

  if (norm.startsWith('!remover ')) {
    const chave = text.substring(9).trim();
    removeResposta(chave);
    await replyAndLog(message, `🗑️ Informação '${chave}' removida.`);
    return;
  }

  // ================== 4. INTELIGÊNCIA ARTIFICIAL (GEMINI) ==================
  resetUsageIfNewDay();
  const newChars = text.length;

  // Verifica limites do banco de dados
  if (usage.messages + 1 > limitMsg || usage.chars + newChars > limitChar) {
    console.log(`⚠️ Limite diário atingido (${usage.messages} msgs)`);
    await replyAndLog(message, '⚠️ Limite de mensagens diárias do bot atingido. Volte amanhã.');
    return;
  }

  const history = getHistory(from);
  history.push({ role: 'user', content: text });
  const trimmed = history.slice(-MAX_HISTORY);

  // Monta contexto com as informações do "Conhecimento"
  // Filtramos as chaves 'config_' para não mostrar configurações internas para o cliente
  const respostasInfo = getRespostas();
  const infosTexto = Object.entries(respostasInfo)
    .filter(([k]) => !k.startsWith('config_'))
    .map(([key, val]) => `• ${key}: ${val}`)
    .join('\n');

  const contextoExtra = `
Aqui estão informações atualizadas sobre o negócio que você pode usar para responder:
${infosTexto || 'Nenhuma informação extra disponível.'}

Se o usuário quiser agendar, responda APENAS: "Vou verificar a agenda. Qual seu nome?"
`;

  // Adiciona o contexto como uma mensagem de sistema oculta no histórico recente
  const modelHistory = [
    { role: 'user', content: contextoExtra },
    ...trimmed,
  ];

  try {
    // O Prompt do Sistema (personalidade) agora é carregado dentro do generateReply
    const reply = await generateReply(modelHistory);

    trimmed.push({ role: 'assistant', content: reply });
    saveHistory(from, trimmed.slice(-MAX_HISTORY));

    usage.messages += 1;
    usage.chars += newChars;

    // Se a IA detectou intenção de agendar na própria resposta
    if (normalize(reply).includes('qual seu nome') || normalize(reply).includes('verificar a agenda')) {
      setState(from, { step: 'ask_name' });
    }
    
    await replyAndLog(message, reply);

  } catch (err) {
    console.error('Erro IA:', err);
    if (err.status === 429) {
      await replyAndLog(message, 'Estou recebendo muitas mensagens agora, tente em 1 minuto! 😅');
    } else {
      await replyAndLog(message, 'Tive um problema técnico. Tente novamente.');
    }
  }
}

module.exports = {
  handleIncomingMessage,
};