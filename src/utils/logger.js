// src/utils/logger.js
const fs = require('fs');
const path = require('path');

// Arquivo onde vamos salvar o histórico
const LOG_PATH = path.join(process.cwd(), 'conversas.log');

/**
 * Registra uma linha de log no arquivo conversas.log
 * @param {"RECEBIDO"|"RESPONDIDO"} type
 * @param {string} from - número do WhatsApp (ex: 5562...@c.us)
 * @param {string} text - mensagem
 */
function logMessage(type, from, text) {
  const timestamp = new Date().toISOString(); // 2025-11-11T18:23:45.123Z
  const cleanText = String(text).replace(/\s+/g, ' ').trim(); // tira quebras de linha
  const line = `[${timestamp}] [${type}] ${from}: ${cleanText}\n`;

  fs.appendFile(LOG_PATH, line, (err) => {
    if (err) {
      console.error('Erro ao gravar log de conversa:', err);
    }
  });
}

module.exports = { logMessage };