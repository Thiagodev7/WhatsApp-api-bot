// src/utils/chatMemoryManager.js
const fs = require('fs');
const path = require('path');

// Arquivo onde vamos salvar os históricos de conversa
const FILE_PATH = path.join(process.cwd(), 'chatMemory.json');

// Garante que o arquivo existe ao iniciar
function initializeMemory() {
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify({}, null, 2));
  }
}

/**
 * Lê todas as memórias do arquivo
 * @returns {Object<string, any[]>}
 */
function readMemory() {
  try {
    const data = fs.readFileSync(FILE_PATH, 'utf8');
    return JSON.parse(data || '{}');
  } catch (e) {
    console.error('Erro ao ler chatMemory.json:', e);
    return {};
  }
}

/**
 * Escreve todas as memórias no arquivo
 * @param {Object<string, any[]>} data
 */
function writeMemory(data) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Erro ao escrever chatMemory.json:', e);
  }
}

/**
 * Pega o histórico de um utilizador específico
 * @param {string} from
 * @returns {any[]}
 */
function getHistory(from) {
  const allHistories = readMemory();
  return allHistories[from] || [];
}

/**
 * Salva o histórico de um utilizador específico
 * @param {string} from
 * @param {any[]} history
 */
function saveHistory(from, history) {
  const allHistories = readMemory();
  allHistories[from] = history;
  writeMemory(allHistories);
}

// Inicializa o arquivo
initializeMemory();

module.exports = {
  getHistory,
  saveHistory,
};