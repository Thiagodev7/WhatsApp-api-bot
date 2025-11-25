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

app.use(express.static('public'));

// Função para iniciar (ou reiniciar) o bot
function startWhatsappBot() {
    if (client) {
        // Se já existir cliente, remove listeners antigos para não duplicar
        client.removeAllListeners();
    }
    
    // Cria o cliente e passa o IO para enviar o QR Code
    client = createWhatsappClient(handleIncomingMessage, io);

    // Monitora quando estiver pronto para avisar quem entrar no site depois
    client.on('ready', () => {
        isClientReady = true;
    });

    client.on('disconnected', () => {
        isClientReady = false;
    });
}

io.on('connection', (socket) => {
    console.log('🌐 Novo acesso ao painel web');

    // Se o bot já estiver conectado quando a pessoa abrir o site, avisa ela
    if (isClientReady) {
        socket.emit('ready');
    }

    // OUVINTE DO BOTÃO DESCONECTAR
    socket.on('logout', async () => {
        console.log('🔴 Solicitação de logout recebida pelo painel web');
        if (client) {
            try {
                await client.logout(); // Sai do WhatsApp Web
                console.log('Sessão encerrada com sucesso.');
            } catch (err) {
                console.error('Erro ao tentar deslogar (talvez já desconectado):', err.message);
            }

            try {
                await client.destroy(); // Fecha o navegador do bot
            } catch (err) { }
            
            isClientReady = false;
            
            // Reinicia o processo para gerar novo QR Code imediatamente
            console.log('🔄 Reiniciando bot para novo pareamento...');
            startWhatsappBot();
        }
    });
});

function main() {
  console.log('🚀 Iniciando servidor...');
  startWhatsappBot();

  const PORT = process.env.PORT || 80;
  server.listen(PORT, () => {
    console.log(`📡 Painel de Controle: http://SEU_IP_DA_VPS:${PORT}`);
  });
}

main();