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

// GESTORES DE ESTADO (para persistir dados em JSON)
const { getHistory, saveHistory } = require('../utils/chatMemoryManager');
const { getState, setState, deleteState } = require('../utils/bookingStateManager');

const MAX_HISTORY = 6;

const DEFAULT_DURATION = 40; // Duração padrão se não encontrar a informação no JSON.

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
  let state = getState(from);
  
  // ================== 1. COMANDOS ADMIN (PRIORIDADE MÁXIMA) ==================
  if (norm.startsWith('!')) {
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
    
    // Se for um comando desconhecido, avisa o admin
    await replyAndLog(
      message,
      `Comando "${text}" não reconhecido, chefe! 🤷‍♂️\n\nUse: !adicionar, !remover, !listar ou !ping.`
    );
    return;
  }
  
  // ================== 2. COMANDO DE CANCELAMENTO ==================
  if (state && (norm === 'cancelar' || norm === 'sair')) {
    deleteState(from);
    await replyAndLog(message, 'Agendamento cancelado. Se precisar de algo mais, é só chamar! 👍');
    return;
  }

  // ================== 3. FLUXO DE AGENDAMENTO (EM ANDAMENTO) ==================
  if (state) {
    // 1) pegando nome
    if (state.step === 'ask_name') {
      state.name = text;
      state.step = 'ask_service';
      setState(from, state);
      await replyAndLog(
        message,
        `Perfeito, ${state.name}! ✂️\nQual serviço você deseja fazer? (ex: corte masculino, corte feminino, barba, hidratação, tintura, progressiva...)\n\n(Ou digite "cancelar" para sair.)`
      );
      return;
    }

    // 2) pegando serviço
    if (state.step === 'ask_service') {
      state.service = text;
      state.step = 'ask_date';

      // ---- LÓGICA DE DURAÇÃO ----
      const normService = normalize(text);
      const respostas = getRespostas(); 
      let duration = DEFAULT_DURATION; 
      let foundDuration = false;
      const foundKey = Object.keys(respostas).find(key => normService.includes(key));
      
      if (foundKey) {
        const info = respostas[foundKey]; 
        const match = info.match(/(\d+)\s*(min|minutos)/i); 
        if (match && match[1]) {
          duration = parseInt(match[1], 10);
          foundDuration = true;
        }
      }
      if (!foundDuration) {
          console.log(`[AVISO] Não foi encontrada duração no respostas.json para "${normService}". Usando padrão de ${DEFAULT_DURATION} min.`);
      }
      state.duration = duration; 
      console.log(`[INFO] Serviço: "${state.service}", Duração definida: ${duration} min`);
      // ---- FIM DA LÓGICA DE DURAÇÃO ----

      setState(from, state);
      await replyAndLog(
        message,
        `Ótimo! Para qual dia você prefere o atendimento, ${state.name}? Pode ser "hoje", "amanhã" ou uma data no formato 12/11.\n\n(Ou digite "cancelar" para sair.)`
      );
      return;
    }

    // 3) pegando data e mostrando horários disponíveis
    if (state.step === 'ask_date') {
      const parsed = parseDateFromText(text);
      if (!parsed) {
        await replyAndLog(
          message,
          'Não consegui entender a data 😕\nMe envie como "hoje", "amanhã" ou no formato 12/11.\n\n(Ou digite "cancelar" para sair.)'
        );
        return;
      }

      const dateObj = parsed.date;

      // --- MUDANÇA DE LÓGICA: NOVO BLOCO DE VERIFICAÇÃO DE REGRAS ---
      const respostas = getRespostas();
      const diaDaSemana = dateObj.getDay(); // 0 = Domingo, 6 = Sábado
      
      // Procura por regras que bloqueiam o agendamento
      const regraFimDeSemanaKey = Object.keys(respostas).find(k => k.includes('fim de semana') || k.includes('dia e horario'));
      const regraAgendamentoGeralKey = Object.keys(respostas).find(k => k.includes('agendamento'));

      // Regra 1: É fim de semana E existe uma regra sobre fim de semana?
      if ((diaDaSemana === 0 || diaDaSemana === 6) && regraFimDeSemanaKey) {
          const respostaRegra = respostas[regraFimDeSemanaKey]; // Ex: "não aceite agendamentos no fim de semana"
          console.log(`[AGENDAMENTO BLOQUEADO] Motivo: Fim de semana (regra: ${regraFimDeSemanaKey})`);
          await replyAndLog(message, respostaRegra + "\n\nPor favor, escolha outro dia.");
          return; // Bloqueia o agendamento
      }
      
      // Regra 2: Existe uma regra geral de bloqueio de agendamento? (ex: "estou na roça")
      if (regraAgendamentoGeralKey && (normalize(respostas[regraAgendamentoGeralKey]).includes('nao') || normalize(respostas[regraAgendamentoGeralKey]).includes('não'))) {
          const respostaRegra = respostas[regraAgendamentoGeralKey]; // Ex: "na aceite nenhum agendamento, estou na roça"
          console.log(`[AGENDAMENTO BLOQUEADO] Motivo: Regra geral (regra: ${regraAgendamentoGeralKey})`);
          await replyAndLog(message, respostaRegra);
          return; // Bloqueia o agendamento
      }
      // --- FIM DO NOVO BLOCO ---
      
      const iso = formatDateYMD(dateObj);
      const br = formatDateBR(dateObj);

      try {
        const durationInMinutes = state.duration || DEFAULT_DURATION;
        
        const slots = await getAvailableSlots(iso, {
          slotMinutes: durationInMinutes, 
          workStart: '09:00',
          workEnd: '18:00',
        });

        if (!slots.length) {
          await replyAndLog(
            message,
            `No dia ${br} o Gabriel está sem horários disponíveis para "${state.service}" (duração de ${durationInMinutes} min) 😕\nSe quiser, me envie outra data.\n\n(Ou digite "cancelar" para sair.)`
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
          `No dia ${br}, tenho estes horários livres (${durationInMinutes} min) com o Gabriel:\n\n${slotsStr}\n\nMe responde só com o horário desejado (ex: 15:00).\n\n(Ou digite "cancelar" para sair.)`
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
      
      const chosenSlot = slots.find(slot => {
        const normalizedSlot = slot.replace(':', '');
        const normalizedChosen = chosen.replace(':', '');
        return normalizedSlot === normalizedChosen;
      }) || slots.find(slot => slot === chosen); 
      
      if (!chosenSlot) {
        await replyAndLog(
          message,
          `Não encontrei o horário "${chosen}" na lista 😕\nEscolha um dos horários disponíveis: ${slots.join(', ')}\n\n(Ou digite "cancelar" para sair.)`
        );
        return;
      }
      
      const slotTime = chosenSlot; 

      const dateIso = state.dateIso;
      
      // --- CORREÇÃO DE FUSO HORÁRIO ---
      const startDateTime = `${dateIso}T${slotTime}:00-03:00`;
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
      // --- FIM DA CORREÇÃO ---

      const summary = `${state.service} - ${state.name} (${durationInMinutes} min)`;
      const description = `Agendamento via WhatsApp para ${state.name} (Tel: ${state.phone}).\nServiço: ${state.service}.\nHorário: ${state.dateBr} às ${slotTime}.\nDuração: ${durationInMinutes} min.`;

      try {
        await createAppointment({
          summary,
          description,
          startDateTime,
          endDateTime: endIso, 
        });

        await replyAndLog(
          message,
          `✅ Prontinho, ${state.name}!\nSeu horário para *${state.service}* foi marcado para *${state.dateBr} às ${slotTime}* com o Gabriel Santos.\n\nTe esperamos no salão! 💇‍♂️✨`
        );
        deleteState(from); // Termina o fluxo
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

  // ================== 4. INÍCIO DE NOVO AGENDAMENTO (REMOVIDO) ==================
  // A IA agora é responsável por iniciar o fluxo.
  
  // ================== 5. CONVERSA NORMAL (IA) COM CONTEXTO EXTRA ==================
  // Só chega aqui se não for um comando admin E não estiver num fluxo de agendamento
  
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

  const history = getHistory(from);
  history.push({ role: 'user', content: text });
  const trimmed = history.slice(-MAX_HISTORY);

  // monta contexto com as informações cadastradas
  const respostasInfo = getRespostas();
  const infosTexto = Object.entries(respostasInfo)
    .map(([key, val]) => `• ${key}: ${val}`)
    .join('\n');

  // --- MUDANÇA DE LÓGICA: PROMPT DA IA MELHORADO ---
  const contexto = `
Você é a secretária virtual do cabeleireiro Gabriel Santos.
Sua principal função é responder perguntas sobre os serviços, usando as informações abaixo.

Informações cadastradas:
${infosTexto || 'Nenhuma informação adicional cadastrada ainda.'}

REGRAS IMPORTANTES:
1.  Se a pergunta do usuário for sobre um tópico nas "Informações cadastradas" (ex: "fim de semana", "agendamento", "folga"), VOCÊ DEVE usar essa informação para responder.
2.  SOMENTE SE o usuário perguntar sobre "agendar", "marcar", "horários" OU "vagas" E NÃO HOUVER UMA REGRA de bloqueio (como 'estou na roça' ou 'fim de semana'), responda APENAS:
"Claro! Vou verificar a agenda para você. Qual o seu nome?"
3.  Se não souber responder, diga que vai perguntar ao Gabriel.
`;

  // injeta o contexto como primeira mensagem da "assistente"
  const modelHistory = [
    { role: 'assistant', content: contexto },
    ...trimmed,
  ];

  try {
    const reply = await generateReply(modelHistory);

    trimmed.push({ role: 'assistant', content: reply });
    saveHistory(from, trimmed.slice(-MAX_HISTORY));

    usage.messages += 1;
    usage.chars += newChars;

    console.log(
      `💬 Resposta enviada. Uso hoje: mensagens=${usage.messages}, chars=${usage.chars}`
    );
    
    // Se a IA deu a resposta para iniciar o agendamento...
    if (normalize(reply).includes('qual o seu nome')) {
      // ...nós criamos o estado por baixo dos panos.
      const newState = { step: 'ask_name', phone: phone };
      setState(from, newState);
    }
    
    await replyAndLog(message, reply);

  } catch (err) {
    console.error('Erro ao gerar resposta da IA:', err);
    await replyAndLog(
      message,
      '⚠️ Tive um problema ao tentar responder sua mensagem. Tente novamente em alguns instantes.'
    );
  }}
  module.exports = {
    handleIncomingMessage,
  };