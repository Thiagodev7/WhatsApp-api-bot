const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const { createWhatsappClient } = require('./services/whatsappService');
require('./config/env'); // Carrega as variáveis do .env
const { handleIncomingMessage } = require('./handlers/messageHandler');
const { getRespostas, addResposta, removeResposta } = require('./utils/respostaManager');
const { LOG_FILE, logSystem } = require('./utils/logger');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// SEGURANÇA: Lê a senha do .env (ou usa padrão se esquecer)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

let client = null;
let isClientReady = false;

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/../public/index.html');
});

// --- MONITOR DE LOGS (Otimizado) ---
// Usa fs.watchFile para detectar mudanças no arquivo de log
fs.watchFile(LOG_FILE, { interval: 1000 }, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
        const stream = fs.createReadStream(LOG_FILE, {
            start: prev.size,
            end: curr.size
        });
        stream.on('data', (chunk) => {
            const lines = chunk.toString().split('\n').filter(l => l.trim());
            lines.forEach(line => {
                io.emit('file_log', line);
            });
        });
    }
});

function readLastLogs(callback) {
    if (!fs.existsSync(LOG_FILE)) return callback([]);
    fs.readFile(LOG_FILE, 'utf8', (err, data) => {
        if (err) return callback([]);
        // Pega as últimas 100 linhas para um histórico mais completo
        const lines = data.trim().split('\n').slice(-100); 
        callback(lines);
    });
}

// --- GERENCIADOR DO BOT ---
function startWhatsappBot() {
    // Garante limpeza antes de iniciar
    if (client) {
        try { client.removeAllListeners(); } catch(e){}
    }
    
    client = createWhatsappClient(handleIncomingMessage, io);

    client.on('ready', () => {
        isClientReady = true;
        logSystem('Bot conectado com sucesso ao WhatsApp.', 'SUCCESS');
    });

    // Tratamento profissional de desconexão
    client.on('disconnected', (reason) => {
        isClientReady = false;
        logSystem(`Bot desconectado! Motivo: ${reason}`, 'WARN');
        logSystem('Tentando reiniciar serviço em 5 segundos...', 'SYSTEM');
        
        setTimeout(() => {
            startWhatsappBot(); // Tenta reconectar/gerar novo QR
        }, 5000);
    });
}

// --- SOCKET IO (Comunicação Real-Time) ---
io.on('connection', (socket) => {
    // Envia histórico ao conectar
    readLastLogs((logs) => socket.emit('log_history', logs));

    if (isClientReady) socket.emit('ready');

    // Autenticação Segura
    socket.on('auth_request', (password) => {
        // Compara com a senha do .env
        if(password === ADMIN_PASSWORD) {
            socket.emit('auth_success');
        } else {
            socket.emit('auth_fail');
            logSystem(`Tentativa de acesso admin falhou. IP: ${socket.handshake.address}`, 'WARN');
        }
    });

    // Gestão de Dados
    socket.on('request_knowledge', () => {
        socket.emit('knowledge_update', getRespostas());
    });

    socket.on('add_knowledge', (data) => {
        if(data.key && data.value) {
            addResposta(data.key, data.value);
            io.emit('knowledge_update', getRespostas());
            // Log de auditoria
            logSystem(`Admin adicionou chave: "${data.key}"`, 'ADMIN');
            // Confirmação para o frontend tocar som/aviso
            socket.emit('operation_success', 'Informação salva com sucesso!');
        }
    });

    socket.on('delete_knowledge', (key) => {
        removeResposta(key);
        io.emit('knowledge_update', getRespostas());
        logSystem(`Admin removeu chave: "${key}"`, 'ADMIN');
        socket.emit('operation_success', 'Informação removida!');
    });

    // Reinício Manual
    socket.on('logout', async () => {
        logSystem('Solicitação manual de reinício via Painel.', 'ADMIN');
        if (client) {
            try { await client.logout(); } catch (e) {}
            try { await client.destroy(); } catch (e) {}
            isClientReady = false;
            startWhatsappBot();
        }
    });
});

function main() {
  logSystem('=== SISTEMA THIAGO.AI INICIADO ===', 'BOOT');
  startWhatsappBot();

  const PORT = process.env.PORT || 3001; 
  server.listen(PORT, () => {
    console.log(`📡 Servidor rodando na porta ${PORT}`);
  });
}

main();