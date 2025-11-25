const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createWhatsappClient } = require('./services/whatsappService');
require('./config/env');
const { handleIncomingMessage } = require('./handlers/messageHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Variável global para controlar o cliente do WhatsApp
let client = null;
let isClientReady = false;

// ESSA LINHA É A MÁGICA: Ela manda carregar os arquivos da pasta 'public'
app.use(express.static('public'));

// Rota de fallback caso não ache o index.html (opcional, mas bom pra debug)
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/../public/index.html');
});

function startWhatsappBot() {
    if (client) {
        client.removeAllListeners();
    }
    
    // Passa o IO para enviar o QR Code
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
  console.log('🚀 Iniciando servidor...');
  startWhatsappBot();

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`📡 Servidor rodando na porta ${PORT}`);
  });
}

main();