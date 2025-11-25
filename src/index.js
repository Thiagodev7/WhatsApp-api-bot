const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createWhatsappClient } = require('./services/whatsappService');
require('./config/env');
const { handleIncomingMessage } = require('./handlers/messageHandler');
const { getRespostas, addResposta, removeResposta } = require('./utils/respostaManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIGURAÇÃO DA SENHA DE ADMIN ---
const ADMIN_PASSWORD = "admin"; // <--- TROQUE ESSA SENHA DEPOIS!

let client = null;
let isClientReady = false;

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/../public/index.html');
});

function startWhatsappBot() {
    if (client) {
        client.removeAllListeners();
    }
    
    // Passa o 'io' para o serviço poder enviar logs em tempo real
    client = createWhatsappClient(handleIncomingMessage, io);

    client.on('ready', () => {
        isClientReady = true;
    });

    client.on('disconnected', () => {
        isClientReady = false;
    });
}

io.on('connection', (socket) => {
    console.log('🌐 Painel Web conectado');

    if (isClientReady) {
        socket.emit('ready');
    }

    // --- SISTEMA DE SEGURANÇA ---
    socket.on('auth_request', (password) => {
        if(password === ADMIN_PASSWORD) {
            socket.emit('auth_success');
        } else {
            socket.emit('auth_fail');
        }
    });

    // --- COMANDOS DE BANCO DE DADOS ---
    socket.on('request_knowledge', () => {
        const dados = getRespostas();
        socket.emit('knowledge_update', dados);
    });

    socket.on('add_knowledge', (data) => {
        if(data.key && data.value) {
            addResposta(data.key, data.value);
            io.emit('knowledge_update', getRespostas());
            console.log(`💾 [Admin] Adicionou: ${data.key}`);
        }
    });

    socket.on('delete_knowledge', (key) => {
        removeResposta(key);
        io.emit('knowledge_update', getRespostas());
        console.log(`🗑️ [Admin] Removeu: ${key}`);
    });

    // --- CONTROLE DO BOT ---
    socket.on('logout', async () => {
        console.log('🔴 Logout solicitado via web');
        if (client) {
            try { await client.logout(); } catch (e) {}
            try { await client.destroy(); } catch (e) {}
            isClientReady = false;
            console.log('🔄 Reiniciando bot...');
            startWhatsappBot();
        }
    });
});

function main() {
  console.log('🚀 Iniciando servidor THIAGO.AI...');
  startWhatsappBot();

  // Garante que usa a porta configurada ou a 3001
  const PORT = process.env.PORT || 3001; 
  server.listen(PORT, () => {
    console.log(`📡 Servidor rodando na porta ${PORT}`);
  });
}

main();