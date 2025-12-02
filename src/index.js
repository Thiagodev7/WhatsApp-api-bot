const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const initDb = require('./database/initDb');
const WhatsAppManager = require('./managers/WhatsAppManager');

// Configuração do Servidor
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Inicialização
async function bootstrap() {
    // 1. Banco de Dados
    await initDb();

    // 2. Gerenciador do WhatsApp
    const waManager = new WhatsAppManager(io);
    await waManager.initializeAll();

    // 3. API Endpoints (Para o Painel SaaS)
    app.use(express.json());
    app.use(express.static('public'));

    // Rota para o Frontend se conectar à "sala" da empresa dele
    io.on('connection', (socket) => {
        socket.on('join_company', (companyId) => {
            socket.join(companyId); // Cliente entra na sala da empresa
            console.log(`Socket ${socket.id} entrou na sala ${companyId}`);
        });
        
        // Comandos do Painel
        socket.on('restart_bot', (companyId) => waManager.restartSession(companyId));
    });

    // 4. Start Server
    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
        console.log(`🚀 Servidor SaaS rodando na porta ${PORT}`);
    });
}

bootstrap();