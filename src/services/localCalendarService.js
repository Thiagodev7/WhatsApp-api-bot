const db = require('../config/database');
const { getRespostas } = require('../utils/respostaManager');

async function getAvailableSlots(dateIso, options = {}) {
    const settings = await getRespostas();
    const workStart = settings['config_inicio'] || '09:00';
    const workEnd = settings['config_fim'] || '19:00';
    
    let slotMinutes = options.slotMinutes;
    if (!slotMinutes) {
        slotMinutes = parseInt(settings['config_duracao']) || 40;
    }

    const startOfDay = `${dateIso} 00:00:00`;
    const endOfDayStr = `${dateIso} 23:59:59`;

    try {
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
        let current = new Date(`${dateIso}T${workStart}:00`);
        const endOfDay = new Date(`${dateIso}T${workEnd}:00`);
        const now = new Date(); 

        while (current < endOfDay) {
            const slotStart = new Date(current);
            const slotEnd = new Date(current.getTime() + slotMinutes * 60000);

            if (slotEnd > endOfDay) break;

            if (slotStart < now) {
                current = slotEnd;
                continue;
            }

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

async function createAppointment({ clientName, serviceName, clientPhone, status, startDateTime, endDateTime }) {
    try {
        const summary = `${serviceName} - ${clientName}`;
        const res = await db.query(
            `INSERT INTO appointments (
                client_name, service_name, client_phone, 
                summary, description, status, 
                start_time, end_time
            )
             VALUES ($1, $2, $3, $4, 'Via Bot', $5, $6, $7)
             RETURNING *`,
            [clientName, serviceName, clientPhone, summary, status || 'agendado', startDateTime, endDateTime]
        );

        const row = res.rows[0];
        return mapRow(row);
    } catch (error) {
        console.error("Erro ao criar agendamento:", error);
        throw error;
    }
}

async function getAllAppointments() {
    try {
        const res = await db.query(
            `SELECT * FROM appointments ORDER BY start_time ASC`
        );
        return res.rows.map(mapRow);
    } catch (error) {
        console.error("Erro ao listar:", error);
        return [];
    }
}

async function updateAppointmentStatus(id, status) {
    try {
        await db.query('UPDATE appointments SET status = $1 WHERE id = $2', [status, id]);
        return true;
    } catch (error) {
        console.error("Erro ao atualizar status:", error);
        return false;
    }
}

// --- [ALTERAÇÃO IMPORTANTE AQUI] ---
// Lógica inteligente para achar o agendamento certo
async function findPendingAppointment(phone) {
    try {
        // 1. Prioridade: Busca um agendamento que esteja com status 'aguardando'
        // (Ou seja, o sistema acabou de mandar o lembrete automático para ele)
        let res = await db.query(
            `SELECT * FROM appointments 
             WHERE client_phone = $1 
             AND status = 'aguardando'
             ORDER BY start_time ASC 
             LIMIT 1`,
            [phone]
        );
        
        if (res.rows.length > 0) return mapRow(res.rows[0]);

        // 2. Fallback: Se não tiver nenhum 'aguardando', busca o próximo 'agendado' futuro
        // Útil se o cliente confirmar espontaneamente antes do lembrete
        res = await db.query(
            `SELECT * FROM appointments 
             WHERE client_phone = $1 
             AND status = 'agendado'
             AND start_time > NOW()
             ORDER BY start_time ASC 
             LIMIT 1`,
            [phone]
        );

        if (res.rows.length > 0) return mapRow(res.rows[0]);

        return null;
    } catch (error) {
        console.error("Erro ao buscar pendente:", error);
        return null;
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

function mapRow(row) {
    return {
        id: row.id.toString(),
        client: row.client_name,
        service: row.service_name,
        phone: row.client_phone,
        status: row.status,
        summary: row.summary,
        start: row.start_time.toISOString(),
        end: row.end_time.toISOString(),
        createdAt: row.created_at.toISOString()
    };
}

module.exports = { getAvailableSlots, createAppointment, getAllAppointments, deleteAppointment, updateAppointmentStatus, findPendingAppointment };