const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const { createWhatsappClient } = require('./services/whatsappService');
require('./config/env');
const { handleIncomingMessage } = require('./handlers/messageHandler');
const { getRespostas, addResposta, removeResposta } = require('./utils/respostaManager');
const { getAllAppointments, deleteAppointment, updateAppointmentStatus } = require('./services/localCalendarService');
const { LOG_FILE, logSystem } = require('./utils/logger');
const initDb = require('./utils/initDb'); 
const { initScheduler } = require('./services/schedulerService'); // <--- NOVO IMPORT

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
let client = null;
let isClientReady = false;

app.use(express.static('public'));
app.get('/', (req, res) => res.sendFile(__dirname + '/../public/index.html'));

// Logs
fs.watchFile(LOG_FILE, { interval: 1000 }, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
        const stream = fs.createReadStream(LOG_FILE, { start: prev.size, end: curr.size });
        stream.on('data', (chunk) => {
            chunk.toString().split('\n').filter(l => l.trim()).forEach(line => io.emit('file_log', line));
        });
    }
});

function readLastLogs(cb) {
    if (!fs.existsSync(LOG_FILE)) return cb([]);
    fs.readFile(LOG_FILE, 'utf8', (err, d) => cb(err ? [] : d.trim().split('\n').slice(-100)));
}

function startWhatsappBot() {
    if (client) { try { client.removeAllListeners(); } catch(e){} }
    client = createWhatsappClient(handleIncomingMessage, io);
    
    client.on('ready', () => { 
        isClientReady = true; 
        logSystem('Bot conectado.', 'SUCCESS');
        
        // --- INICIA O AGENDADOR DE LEMBRETES ---
        initScheduler(client, io); 
        console.log('🕒 Sistema de Lembretes Automáticos Ativado');
    });
    
    client.on('disconnected', (r) => { 
        isClientReady = false; logSystem(`Desconectado: ${r}`, 'WARN'); 
        setTimeout(startWhatsappBot, 5000); 
    });
}

io.on('connection', (socket) => {
    readLastLogs((logs) => socket.emit('log_history', logs));
    if (isClientReady) socket.emit('ready');

    socket.on('auth_request', (p) => socket.emit(p === ADMIN_PASSWORD ? 'auth_success' : 'auth_fail'));

    // Configs
    socket.on('request_knowledge', async () => socket.emit('knowledge_update', await getRespostas()));
    
    socket.on('add_knowledge', async (d) => { 
        await addResposta(d.key, d.value); 
        io.emit('knowledge_update', await getRespostas()); 
        socket.emit('operation_success', 'Salvo!'); 
    });
    
    socket.on('delete_knowledge', async (k) => { 
        await removeResposta(k); 
        io.emit('knowledge_update', await getRespostas()); 
        socket.emit('operation_success', 'Removido!'); 
    });

    // Agenda
    socket.on('request_appointments', async () => socket.emit('appointments_update', await getAllAppointments()));
    
    socket.on('delete_appointment', async (id) => {
        if(await deleteAppointment(id)) {
            io.emit('appointments_update', await getAllAppointments());
            socket.emit('operation_success', 'Agendamento cancelado');
        }
    });

    // Envio Manual de Lembrete (Botão Sininho)
    socket.on('send_reminder', async (data) => {
        if (!client || !isClientReady) return socket.emit('operation_fail', 'Bot desconectado!');
        
        const chatId = data.phone.includes('@') ? data.phone : `${data.phone}@c.us`;
        const msg = `Olá ${data.client}! 👋\n\nPassando para lembrar do seu horário:\n🗓️ *${data.date}* às *${data.time}*\n\nConfirma sua presença?`;

        try {
            await client.sendMessage(chatId, msg);
            await updateAppointmentStatus(data.id, 'aguardando');
            
            io.emit('appointments_update', await getAllAppointments());
            socket.emit('operation_success', 'Lembrete enviado!');
            logSystem(`Lembrete MANUAL enviado para ${data.client}`, 'INFO');
        } catch (e) {
            console.error('Erro ao enviar lembrete:', e);
            socket.emit('operation_fail', 'Erro ao enviar.');
        }
    });

    socket.on('logout', async () => {
        logSystem('Reiniciando...', 'ADMIN');
        if (client) { try { await client.logout(); await client.destroy(); } catch(e){} }
        setTimeout(() => process.exit(0), 1000);
    });
});

async function main() {
  await initDb();
  logSystem('=== SISTEMA INICIADO ===', 'BOOT');
  startWhatsappBot();
  const PORT = process.env.PORT || 3001; 
  server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
}
main();