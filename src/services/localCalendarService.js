const db = require('../config/database');
const { getRespostas } = require('../utils/respostaManager');

/**
 * Busca horários disponíveis no banco, respeitando configurações e hora atual.
 */
async function getAvailableSlots(dateIso, options = {}) {
    // 1. Carrega configurações do Banco de Dados
    const settings = await getRespostas();
    const workStart = settings['config_inicio'] || '09:00'; // Padrão 09:00
    const workEnd = settings['config_fim'] || '19:00';     // Padrão 19:00
    
    // Define duração: Prioridade Options > Config Banco > Padrão 40min
    let slotMinutes = options.slotMinutes;
    if (!slotMinutes) {
        slotMinutes = parseInt(settings['config_duracao']) || 40;
    }

    // Define o intervalo do dia para busca
    const startOfDay = `${dateIso} 00:00:00`;
    const endOfDayStr = `${dateIso} 23:59:59`;

    try {
        // Busca agendamentos existentes no dia
        const res = await db.query(
            `SELECT start_time, end_time FROM appointments 
             WHERE start_time >= $1 AND start_time <= $2`,
            [startOfDay, endOfDayStr]
        );

        const dayApps = res.rows.map(row => ({
            start: new Date(row.start_time),
            end: new Date(row.end_time)
        }));

        const slots = [];
        
        // Gera os slots baseados no horário de inicio/fim configurado
        let current = new Date(`${dateIso}T${workStart}:00`);
        const endOfDay = new Date(`${dateIso}T${workEnd}:00`);
        const now = new Date(); // Hora exata de agora

        while (current < endOfDay) {
            const slotStart = new Date(current);
            const slotEnd = new Date(current.getTime() + slotMinutes * 60000);

            if (slotEnd > endOfDay) break;

            // --- LÓGICA DE BLOQUEIO DE PASSADO ---
            // Se slotStart for menor que AGORA, pula (não mostra na lista)
            if (slotStart < now) {
                current = slotEnd;
                continue;
            }

            // Verifica colisão com agendamentos existentes
            const isBusy = dayApps.some(app => {
                return (slotStart < app.end && slotEnd > app.start);
            });

            if (!isBusy) {
                const timeString = slotStart.toTimeString().slice(0, 5);
                slots.push(timeString);
            }

            current = slotEnd;
        }

        return slots;

    } catch (error) {
        console.error("Erro ao buscar slots:", error);
        return [];
    }
}

async function createAppointment({ summary, description, startDateTime, endDateTime }) {
    try {
        const res = await db.query(
            `INSERT INTO appointments (summary, description, start_time, end_time)
             VALUES ($1, $2, $3, $4)
             RETURNING id, summary, description, start_time, end_time, created_at`,
            [summary, description, startDateTime, endDateTime]
        );

        const row = res.rows[0];
        return {
            id: row.id.toString(),
            summary: row.summary,
            description: row.description,
            start: row.start_time.toISOString(),
            end: row.end_time.toISOString(),
            createdAt: row.created_at.toISOString()
        };
    } catch (error) {
        console.error("Erro ao criar agendamento:", error);
        throw error;
    }
}

async function getAllAppointments() {
    try {
        const res = await db.query(
            `SELECT id, summary, description, start_time, end_time, created_at 
             FROM appointments 
             ORDER BY start_time ASC`
        );

        return res.rows.map(row => ({
            id: row.id.toString(),
            summary: row.summary,
            description: row.description,
            start: row.start_time.toISOString(),
            end: row.end_time.toISOString(),
            createdAt: row.created_at.toISOString()
        }));
    } catch (error) {
        console.error("Erro ao listar:", error);
        return [];
    }
}

async function deleteAppointment(id) {
    try {
        const res = await db.query('DELETE FROM appointments WHERE id = $1', [id]);
        return res.rowCount > 0;
    } catch (error) {
        console.error("Erro ao deletar:", error);
        return false;
    }
}

module.exports = { getAvailableSlots, createAppointment, getAllAppointments, deleteAppointment };