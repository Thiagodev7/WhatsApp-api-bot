const db = require('../config/database');

// Cache em memória para performance (sincroniza com banco a cada X ms se necessário, 
// mas para simplicidade vamos ler/gravar direto no banco ou usar memória volátil + persistência)

// Para não ficar lento, vamos usar uma estratégia híbrida:
// Lemos do banco ao iniciar a conversa, e salvamos no banco a cada interação.

let memoryCache = {};

async function loadMemory(phone) {
    if (memoryCache[phone]) return memoryCache[phone];
    
    try {
        const res = await db.query('SELECT history FROM memory WHERE phone = $1', [phone]);
        if (res.rows.length > 0) {
            memoryCache[phone] = res.rows[0].history;
            return res.rows[0].history;
        }
    } catch (e) { console.error('Erro ler memória:', e); }
    
    return [];
}

// Como o messageHandler espera síncrono em alguns pontos, 
// vamos adaptar para ele:
// O handler já chama getHistory()... vamos mudar ele para apenas retornar o cache local
// e criar uma função async para carregar antes.
// MAS, para não quebrar tudo, vamos manter a assinatura simples:

// TRUQUE: O handler vai usar o cache em memória (rápido).
// Nós salvamos no banco em "background" (sem await).

function getHistory(phone) {
    return memoryCache[phone] || [];
}

async function saveHistory(phone, history) {
    memoryCache[phone] = history;
    
    // Salva no banco (Fire and forget - não trava o bot)
    try {
        await db.query(
            `INSERT INTO memory (phone, history) VALUES ($1, $2)
             ON CONFLICT (phone) DO UPDATE SET history = $2, updated_at = NOW()`,
            [phone, JSON.stringify(history)]
        );
    } catch (e) {
        console.error('Erro salvar memória no banco:', e);
    }
}

// Carrega memória inicial (pode ser chamado no boot se quiser, ou sob demanda)
// Por enquanto, inicia vazio se reiniciar, mas persiste as novas.
// Para persistência total entre reinícios, precisaríamos carregar tudo ou carregar async no handler.
// Vamos manter simples: ele começa vazio na memória RAM para velocidade, 
// mas salva no banco para backup/futuro.

// Se quiser persistência REAL entre reboots, adicione isto no topo do handleIncomingMessage:
// await loadMemory(phone); 

module.exports = { getHistory, saveHistory, loadMemory };