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
            if (slotStart < now) { current = slotEnd; continue; }

            const isBusy = dayApps.some(app => (slotStart < app.end && slotEnd > app.start));

            if (!isBusy) {
                slots.push(slotStart.toTimeString().slice(0, 5));
            }
            current = slotEnd;
        }
        return slots;

    } catch (error) {
        console.error("Erro ao buscar slots:", error);
        return [];
    }
}

// --- CRIAÇÃO CORRETA COM NOVOS CAMPOS ---
async function createAppointment({ clientName, serviceName, clientPhone, startDateTime, endDateTime }) {
    try {
        // Mantemos o summary como backup visual, mas salvamos os dados reais nas colunas certas
        const summary = `${serviceName} - ${clientName}`;
        
        const res = await db.query(
            `INSERT INTO appointments (
                client_name, service_name, client_phone, 
                summary, description, status, 
                start_time, end_time
            )
             VALUES ($1, $2, $3, $4, 'Via Bot', 'agendado', $5, $6)
             RETURNING *`,
            [clientName, serviceName, clientPhone, summary, startDateTime, endDateTime]
        );

        const row = res.rows[0];
        return {
            id: row.id.toString(),
            client: row.client_name,
            service: row.service_name,
            phone: row.client_phone,
            status: row.status,
            start: row.start_time.toISOString(),
            end: row.end_time.toISOString()
        };
    } catch (error) {
        console.error("Erro ao criar agendamento:", error);
        throw error;
    }
}

// --- LISTAGEM CORRETA ---
async function getAllAppointments() {
    try {
        const res = await db.query(
            `SELECT id, client_name, service_name, client_phone, status, start_time, end_time, summary
             FROM appointments 
             ORDER BY start_time ASC`
        );

        return res.rows.map(row => ({
            id: row.id.toString(),
            client: row.client_name,   // Novo campo
            service: row.service_name, // Novo campo
            phone: row.client_phone,   // Novo campo
            status: row.status,
            summary: row.summary,      // Mantido para compatibilidade
            start: row.start_time.toISOString(),
            end: row.end_time.toISOString()
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