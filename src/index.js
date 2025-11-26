const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const { createWhatsappClient } = require('./services/whatsappService');
require('./config/env');
const { handleIncomingMessage } = require('./handlers/messageHandler');
const { getRespostas, addResposta, removeResposta } = require('./utils/respostaManager');
const { getAllAppointments, deleteAppointment } = require('./services/localCalendarService');
const { LOG_FILE, logSystem } = require('./utils/logger');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
let client = null;
let isClientReady = false;

app.use(express.static('public'));
app.get('/', (req, res) => res.sendFile(__dirname + '/../public/index.html'));

// Logs em Tempo Real
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
    client.on('ready', () => { isClientReady = true; logSystem('Bot conectado.', 'SUCCESS'); });
    client.on('disconnected', (r) => { 
        isClientReady = false; logSystem(`Desconectado: ${r}`, 'WARN'); 
        setTimeout(startWhatsappBot, 5000); 
    });
}

io.on('connection', (socket) => {
    readLastLogs((logs) => socket.emit('log_history', logs));
    if (isClientReady) socket.emit('ready');

    socket.on('auth_request', (p) => socket.emit(p === ADMIN_PASSWORD ? 'auth_success' : 'auth_fail'));

    socket.on('request_knowledge', () => socket.emit('knowledge_update', getRespostas()));
    socket.on('add_knowledge', (d) => { addResposta(d.key, d.value); io.emit('knowledge_update', getRespostas()); });
    socket.on('delete_knowledge', (k) => { removeResposta(k); io.emit('knowledge_update', getRespostas()); });

    socket.on('request_appointments', () => socket.emit('appointments_update', getAllAppointments()));
    socket.on('delete_appointment', (id) => {
        if(deleteAppointment(id)) {
            io.emit('appointments_update', getAllAppointments());
            socket.emit('operation_success', 'Agendamento cancelado');
        }
    });

    socket.on('logout', async () => {
        logSystem('Reiniciando...', 'ADMIN');
        if (client) { try { await client.logout(); await client.destroy(); } catch(e){} }
        setTimeout(() => process.exit(0), 1000);
    });
});

function main() {
  logSystem('=== SISTEMA INICIADO ===', 'BOOT');
  startWhatsappBot();
  const PORT = process.env.PORT || 3001; 
  server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
}
main();