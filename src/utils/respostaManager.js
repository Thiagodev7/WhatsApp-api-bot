const db = require('../config/database');

// Busca todas as configurações e retorna como objeto (compatível com o formato antigo)
async function getRespostas() {
    try {
        const res = await db.query('SELECT key, value FROM settings');
        const configMap = {};
        res.rows.forEach(row => {
            configMap[row.key] = row.value;
        });
        return configMap;
    } catch (e) {
        console.error('Erro ao ler settings:', e);
        return {};
    }
}

// Adiciona ou Atualiza uma configuração no banco
async function addResposta(key, value) {
    const k = key.toLowerCase();
    try {
        // UPSERT: Insere, ou atualiza se a chave já existir
        await db.query(
            `INSERT INTO settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = $2`,
            [k, value]
        );
    } catch (e) {
        console.error('Erro ao salvar setting:', e);
    }
}

// Remove uma configuração do banco
async function removeResposta(key) {
    const k = key.toLowerCase();
    try {
        await db.query('DELETE FROM settings WHERE key = $1', [k]);
    } catch (e) {
        console.error('Erro ao deletar setting:', e);
    }
}

// Lista as configurações (usado pelo comando !listar)
async function listRespostas() {
    const map = await getRespostas();
    return Object.entries(map).map(([k, v]) => `${k}: ${v}`);
}

module.exports = { addResposta, removeResposta, getRespostas, listRespostas };