// src/handlers/messageHandler.js
const { generateReply } = require('../services/geminiService');
const {
  allowedNumbers,
  dailyMessageLimit,
  dailyCharLimit,
} = require('../config/env');

const { createAppointment, getAvailableSlots } = require('../services/calendarService');
const { logMessage } = require('../utils/logger');
const {
  addResposta,
  removeResposta,
  listRespostas,
  getRespostas,
} = require('../utils/respostaManager');

// memória simples em RAM (por número) para contexto da IA
const chatMemory = new Map();
const MAX_HISTORY = 6;

// estado de agendamento por usuário
const bookingState = new Map();

// controle global de uso diário da IA
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

// helper pra responder e já registrar no log
async function replyAndLog(message, text) {
  await message.reply(text);
  logMessage('RESPONDIDO', message.from, text);
}

// normaliza texto (remove acentos, minúsculas)
function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// converte texto de data em Date
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

  // tenta formato DD/MM ou DD/MM/AAAA
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
 * @param {import('whatsapp-web.js').Client} client
 * @param {import('whatsapp-web.js').Message} message
 */
async function handleIncomingMessage(client, message) {
  const from = message.from;

  if (message.isStatus) return;
  if (from.endsWith('@g.us')) return; // ignora grupos
  if (message.fromMe) return;

  const text = (message.body || '').trim();
  if (!text) return;

  const phone = from.replace('@c.us', '');

  // loga mensagem recebida
  logMessage('RECEBIDO', from, text);

  // se tiver ALLOWED_NUMBERS, bloqueia outros
  if (allowedNumbers && allowedNumbers.length && !allowedNumbers.includes(phone)) {
    console.log(`Mensagem ignorada de número não autorizado: ${phone}`);
    return;
  }

  console.log(`📩 ${from}: ${text}`);

  const norm = normalize(text);
  let state = bookingState.get(from);

// ================== COMANDOS ADMIN DE RESPOSTAS PRONTAS ==================
if (norm === '!ping') {
  await replyAndLog(
    message,
    '🏓 pong! — A *IA*, criada pelo gênio Thiago 🧠✨, está viva, operante e provavelmente mais inteligente que o Google hoje 😎'
  );
  return;
}

if (norm.startsWith('!listar')) {
  const lista = listRespostas();
  if (lista.length === 0) {
    await replyAndLog(
      message,
      '🤔 A *IA* (orgulhosamente criada pelo gênio Thiago 🧠) ainda não sabe de nada! Use o comando:\n\n!adicionar nome = texto da informação\n\npra ensinar essa criatura brilhante 🤖'
    );
  } else {
    const textList = lista.map((r, i) => `${i + 1}. ${r}`).join('\n');
    await replyAndLog(
      message,
      `📚 *Banco de sabedoria da IA (criada pelo gênio Thiago 🧠):*\n\n${textList}\n\n💡 Essas informações ficam guardadas no cérebro cibernético dela e são usadas pra responder com estilo! 😎`
    );
  }
  return;
}

if (norm.startsWith('!adicionar ')) {
  const raw = text.substring('!adicionar'.length).trim();
  const parts = raw.split('=');
  if (parts.length < 2) {
    await replyAndLog(
      message,
      '⚙️ Formato inválido!\nUse: !adicionar chave = texto da informação\n\nExemplo:\n!adicionar corte masculino = R$60 e leva 40 minutos 💇‍♂️'
    );
    return;
  }

  const chave = parts[0].trim();
  const info = parts.slice(1).join('=').trim();

  if (!chave || !info) {
    await replyAndLog(
      message,
      '⚙️ Faltou alguma coisa aí! Use: !adicionar chave = texto da informação'
    );
    return;
  }

  addResposta(chave, info);
  await replyAndLog(
    message,
    `✅ Informação adicionada com sucesso ao incrível cérebro da *IA*, uma criação magistral do gênio Thiago 🧠💫\n\n🧩 *Chave:* ${chave}\n📖 *Conteúdo:* ${info}\n\nAgora ela sabe mais do que nunca! 🤖🔥`
  );
  return;
}

if (norm.startsWith('!remover ')) {
  const chave = text.substring('!remover'.length).trim();
  if (!chave) {
    await replyAndLog(
      message,
      '⚠️ Esqueceu de dizer o que quer apagar, meu caro humano! 😅\nExemplo: !remover corte masculino'
    );
    return;
  }

  removeResposta(chave);
  await replyAndLog(
    message,
    `🗑️ A *IA* (criada pelo lendário Thiago 🧞‍♂️) esqueceu a informação sobre *${chave}*.\n\nMas cuidado... dizem que ela nunca perdoa quem apaga o que ela sabia 😏`
  );
  return;
}

  // ================== FLUXO DE AGENDAMENTO (em andamento) ==================
  if (state) {
    // 1) pegando nome
    if (state.step === 'ask_name') {
      state.name = text;
      state.step = 'ask_service';
      bookingState.set(from, state);
      await replyAndLog(
        message,
        `Perfeito, ${state.name}! ✂️\nQual serviço você deseja fazer? (ex: corte masculino, corte feminino, barba, hidratação, tintura, progressiva...)`
      );
      return;
    }

    // 2) pegando serviço
    if (state.step === 'ask_service') {
      state.service = text;
      state.step = 'ask_date';
      bookingState.set(from, state);
      await replyAndLog(
        message,
        `Ótimo! Para qual dia você prefere o atendimento, ${state.name}? Pode ser "hoje", "amanhã" ou uma data no formato 12/11.`
      );
      return;
    }

    // 3) pegando data e mostrando horários disponíveis
    if (state.step === 'ask_date') {
      const parsed = parseDateFromText(text);
      if (!parsed) {
        await replyAndLog(
          message,
          'Não consegui entender a data 😕\nMe envie como "hoje", "amanhã" ou no formato 12/11.'
        );
        return;
      }

      const dateObj = parsed.date;
      const iso = formatDateYMD(dateObj);
      const br = formatDateBR(dateObj);

      try {
        const slots = await getAvailableSlots(iso, {
          slotMinutes: 40,
          workStart: '09:00',
          workEnd: '18:00',
        });

        if (!slots.length) {
          await replyAndLog(
            message,
            `No dia ${br} o Gabriel está sem horários disponíveis 😕\nSe quiser, me envie outra data.`
          );
          return;
        }

        state.dateIso = iso;
        state.dateBr = br;
        state.slots = slots;
        state.step = 'ask_time';
        bookingState.set(from, state);

        const slotsStr = slots.join(', ');
        await replyAndLog(
          message,
          `No dia ${br}, tenho estes horários livres com o Gabriel:\n\n${slotsStr}\n\nMe responde só com o horário desejado (ex: 15:00).`
        );
      } catch (err) {
        console.error('Erro ao buscar horários disponíveis:', err);
        await replyAndLog(
          message,
          'Tive um problema para consultar os horários disponíveis 😕\nTente novamente em alguns instantes.'
        );
      }
      return;
    }

    // 4) escolhendo horário e criando evento
    if (state.step === 'ask_time') {
      const chosen = text.trim();
      const slots = state.slots || [];
      if (!slots.includes(chosen)) {
        await replyAndLog(
          message,
          `Não encontrei esse horário na lista 😕\nEscolha um dos horários disponíveis: ${slots.join(', ')}`
        );
        return;
      }

      const dateIso = state.dateIso;
      const startDateTime = `${dateIso}T${chosen}:00-03:00`;

      const [h, m] = chosen.split(':').map((n) => parseInt(n, 10));
      const start = new Date(`${dateIso}T${chosen}:00-03:00`);
      start.setHours(h);
      start.setMinutes(m);
      const end = new Date(start.getTime() + 40 * 60 * 1000);
      const endIso = end.toISOString().replace('.000Z', '-03:00');

      const summary = `${state.service} - ${state.name}`;
      const description = `Agendamento via WhatsApp para ${state.name}. Serviço: ${state.service}. Horário: ${state.dateBr} às ${chosen}.`;

      try {
        await createAppointment({
          summary,
          description,
          startDateTime,
          endDateTime: endIso,
        });

        await replyAndLog(
          message,
          `✅ Prontinho, ${state.name}!\nSeu horário para *${state.service}* foi marcado para *${state.dateBr} às ${chosen}* com o Gabriel Santos.\n\nTe esperamos no salão! 💇‍♂️✨`
        );
        bookingState.delete(from);
      } catch (err) {
        console.error('Erro ao criar agendamento:', err);
        await replyAndLog(
          message,
          '⚠️ Não consegui criar o agendamento no calendário. Tente novamente ou fale com o Gabriel.'
        );
      }

      return;
    }
  }

  // ================== INÍCIO DE UM NOVO FLUXO DE AGENDAMENTO ==================
  if (
    norm.includes('agendar') ||
    norm.includes('marcar horario') ||
    norm.includes('marcar hora') ||
    norm.includes('marcar corte') ||
    norm.includes('quero um horario') ||
    norm.includes('quero horario')
  ) {
    const newState = { step: 'ask_name' };
    bookingState.set(from, newState);

    await replyAndLog(
      message,
      'Perfeito! Vamos agendar seu horário com o Gabriel Santos 💇‍♂️\nPrimeiro, me diga seu nome:'
    );
    return;
  }

  // ================== CONVERSA NORMAL -> IA (GEMINI) COM CONTEXTO EXTRA ==================
  resetUsageIfNewDay();

  const newChars = text.length;

  if (
    usage.messages + 1 > dailyMessageLimit ||
    usage.chars + newChars > dailyCharLimit
  ) {
    console.log(
      `⚠️ Limite diário atingido: mensagens=${usage.messages}, chars=${usage.chars}`
    );
    await replyAndLog(
      message,
      '⚠️ O limite diário de uso da assistente virtual foi atingido. Tente novamente amanhã.'
    );
    return;
  }

  const history = chatMemory.get(from) || [];
  history.push({ role: 'user', content: text });
  const trimmed = history.slice(-MAX_HISTORY);

  // monta contexto com as informações cadastradas
  const respostasInfo = getRespostas();
  const infosTexto = Object.entries(respostasInfo)
    .map(([key, val]) => `• ${key}: ${val}`)
    .join('\n');

  const contexto = `
Você é a secretária virtual do cabeleireiro Gabriel Santos.
Use as informações abaixo sobre os serviços do salão para responder de forma precisa e amigável.
Se alguma informação não estiver nas listas, responda com educação dizendo que vai repassar a dúvida para o Gabriel.

Informações cadastradas:
${infosTexto || 'Nenhuma informação adicional cadastrada ainda.'}
`;

  // injeta o contexto como primeira mensagem da "assistente"
  const modelHistory = [
    { role: 'assistant', content: contexto },
    ...trimmed,
  ];

  try {
    const reply = await generateReply(modelHistory);

    trimmed.push({ role: 'assistant', content: reply });
    chatMemory.set(from, trimmed.slice(-MAX_HISTORY));

    usage.messages += 1;
    usage.chars += newChars;

    console.log(
      `💬 Resposta enviada. Uso hoje: mensagens=${usage.messages}, chars=${usage.chars}`
    );
    await replyAndLog(message, reply);
  } catch (err) {
    console.error('Erro IA:', err);
    await replyAndLog(
      message,
      '⚠️ Ocorreu um erro ao gerar a resposta. Tente novamente em alguns instantes.'
    );
  }
}

module.exports = {
  handleIncomingMessage,
};