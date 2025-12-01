const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(process.cwd(), 'conversa.log');

// Função auxiliar para pegar hora local correta
function getLocalTimestamp() {
  const now = new Date();
  // Ajusta o fuso horário subtraindo o offset (em minutos)
  const offset = now.getTimezoneOffset() * 60000; 
  const localDate = new Date(now.getTime() - offset);
  // Retorna formato YYYY-MM-DD HH:mm:ss
  return localDate.toISOString().replace('T', ' ').substring(0, 19);
}

function logMessage(type, contact, content) {
  const date = getLocalTimestamp();
  const logLine = `[${date}] [${type}] [${contact}]: ${content}\n`;
  console.log(logLine.trim()); // Mostra no terminal
  
  fs.appendFile(LOG_FILE, logLine, (err) => {
    if (err) console.error('Erro logger:', err);
  });
}

function logSystem(msg, type = 'INFO') {
    const date = getLocalTimestamp();
    const logLine = `[${date}] [${type}] SYSTEM: ${msg}\n`;
    console.log(logLine.trim());
    
    fs.appendFile(LOG_FILE, logLine, (err) => {
        if (err) console.error('Erro logger:', err);
    });
}

module.exports = { logMessage, logSystem, LOG_FILE };