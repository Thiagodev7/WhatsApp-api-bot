const db = require('../config/database');

let stateCache = {};

function getState(phone) {
    return stateCache[phone] || null;
}

async function setState(phone, state) {
    stateCache[phone] = state;
    
    try {
        await db.query(
            `INSERT INTO booking_state (phone, state) VALUES ($1, $2)
             ON CONFLICT (phone) DO UPDATE SET state = $2, updated_at = NOW()`,
            [phone, JSON.stringify(state)]
        );
    } catch (e) { console.error('Erro salvar estado:', e); }
}

async function deleteState(phone) {
    delete stateCache[phone];
    try {
        await db.query('DELETE FROM booking_state WHERE phone = $1', [phone]);
    } catch (e) { console.error('Erro deletar estado:', e); }
}

// Função para carregar do banco (opcional, usar no início da mensagem)
async function loadState(phone) {
    try {
        const res = await db.query('SELECT state FROM booking_state WHERE phone = $1', [phone]);
        if (res.rows.length > 0) stateCache[phone] = res.rows[0].state;
    } catch (e) {}
}

module.exports = { getState, setState, deleteState, loadState };