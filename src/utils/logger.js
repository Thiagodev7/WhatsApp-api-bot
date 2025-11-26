// src/utils/logger.js
const fs = require('fs');
const path = require('path');

// Caminho do arquivo de log na raiz do projeto
const LOG_FILE = path.join(process.cwd(), 'conversas.log');

function logMessage(type, contact, content) {
  const date = new Date().toISOString().replace('T', ' ').substring(0, 19);
  
  // Formata a linha: [DATA] [TIPO] [CONTATO] MENSAGEM
  const logLine = `[${date}] [${type}] [${contact}]: ${content}\n`;

  // Escreve no arquivo (cria se não existir)
  fs.appendFile(LOG_FILE, logLine, (err) => {
    if (err) console.error('Erro ao salvar log:', err);
  });
}

// Função genérica para logar qualquer coisa
function logSystem(msg, type = 'INFO') {
    const date = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const logLine = `[${date}] [${type}] SYSTEM: ${msg}\n`;
    
    fs.appendFile(LOG_FILE, logLine, (err) => {
        if (err) console.error('Erro ao salvar log:', err);
    });
}

module.exports = { logMessage, logSystem, LOG_FILE };