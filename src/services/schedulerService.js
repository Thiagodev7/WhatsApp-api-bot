const cron = require('node-cron');
const db = require('../config/database');
const { updateAppointmentStatus } = require('./localCalendarService');
const { logSystem } = require('../utils/logger');

// Função auxiliar para formatar data local (YYYY-MM-DD HH:mm:ss)
// Remove a conversão automática para UTC do .toISOString()
function toLocalISO(date) {
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().slice(0, 19).replace('T', ' ');
}

function initScheduler(client, io) {
    // Roda a cada 1 minuto
    cron.schedule('* * * * *', async () => {
        
        // 1. Define o horário alvo (Agora + 3 horas)
        const now = new Date();
        const targetTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
        
        // 2. Cria intervalo de busca (target -1 min até target +1 min)
        const startRangeObj = new Date(targetTime.getTime() - 60000);
        const endRangeObj = new Date(targetTime.getTime() + 60000);

        // 3. Converte para String Local (AQUI ESTÁ A CORREÇÃO)
        const rangeStart = toLocalISO(startRangeObj);
        const rangeEnd = toLocalISO(endRangeObj);

        console.log(`⏰ Buscando agendamentos entre: ${rangeStart} e ${rangeEnd}`);

        try {
            // Busca no banco comparando Strings Locais
            const res = await db.query(
                `SELECT * FROM appointments 
                 WHERE start_time >= $1 
                 AND start_time <= $2 
                 AND status = 'agendado'
                 AND client_phone IS NOT NULL`,
                [rangeStart, rangeEnd]
            );

            if (res.rows.length > 0) {
                console.log(`🔔 Encontrados ${res.rows.length} agendamentos para lembrete.`);
                for (const app of res.rows) {
                    await sendAutomaticReminder(client, io, app);
                }
            }

        } catch (error) {
            console.error('Erro no Scheduler:', error);
        }
    });
}

async function sendAutomaticReminder(client, io, appData) {
    if (!client) return;

    const phone = appData.client_phone.replace(/\D/g, '');
    const chatId = phone.includes('@') ? phone : `${phone}@c.us`;

    // Formata visualmente para a mensagem
    const dateObj = new Date(appData.start_time);
    const dateStr = dateObj.toLocaleDateString('pt-BR');
    const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    const firstName = appData.client_name ? appData.client_name.split(' ')[0] : 'Cliente';

    const msg = `Olá ${firstName}! 👋\n\nLembrete automático: Seu horário é hoje daqui a pouco!\n\n🗓️ *${dateStr}*\n⏰ *${timeStr}*\n✂️ *${appData.service_name || 'Serviço'}*\n\nPosso confirmar sua presença? (Responda "Sim" para confirmar)`;

    try {
        await client.sendMessage(chatId, msg);
        
        await updateAppointmentStatus(appData.id, 'aguardando');
        
        if (io) {
            // Recarrega a lista para atualizar o status na tela
            const { getAllAppointments } = require('./localCalendarService');
            io.emit('appointments_update', await getAllAppointments());
        }

        logSystem(`Lembrete AUTO enviado para ${firstName} (${phone})`, 'INFO');

    } catch (e) {
        console.error(`Falha ao enviar lembrete auto para ${phone}:`, e);
    }
}

module.exports = { initScheduler };