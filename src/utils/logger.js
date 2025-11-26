const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(process.cwd(), 'conversa.log');

function logMessage(type, contact, content) {
  const date = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const logLine = `[${date}] [${type}] [${contact}]: ${content}\n`;
  console.log(logLine.trim()); // Mostra no terminal também
  
  fs.appendFile(LOG_FILE, logLine, (err) => {
    if (err) console.error('Erro logger:', err);
  });
}

function logSystem(msg, type = 'INFO') {
    const date = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const logLine = `[${date}] [${type}] SYSTEM: ${msg}\n`;
    console.log(logLine.trim());
    
    fs.appendFile(LOG_FILE, logLine, (err) => {
        if (err) console.error('Erro logger:', err);
    });
}

module.exports = { logMessage, logSystem, LOG_FILE };