// src/utils/bookingStateManager.js
const fs = require('fs');
const path = require('path');

// Arquivo onde vamos salvar o estado dos agendamentos
const FILE_PATH = path.join(process.cwd(), 'bookingState.json');

// Garante que o arquivo existe ao iniciar
function initializeState() {
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify({}, null, 2));
  }
}

/**
 * Lê todos os estados do arquivo
 * @returns {Object<string, any>}
 */
function readState() {
  try {
    const data = fs.readFileSync(FILE_PATH, 'utf8');
    return JSON.parse(data || '{}');
  } catch (e) {
    console.error('Erro ao ler bookingState.json:', e);
    return {}; // Retorna um objeto vazio em caso de erro
  }
}

/**
 * Escreve todos os estados no arquivo
 * @param {Object<string, any>} data
 */
function writeState(data) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Erro ao escrever bookingState.json:', e);
  }
}

/**
 * Pega o estado de um utilizador específico
 * @param {string} from - O ID do utilizador (ex: 5562...@c.us)
 * @returns {any | null}
 */
function getState(from) {
  const allStates = readState();
  return allStates[from] || null;
}

/**
 * Define o estado de um utilizador específico
 * @param {string} from
 * @param {any} state
 */
function setState(from, state) {
  const allStates = readState();
  allStates[from] = state;
  writeState(allStates);
}

/**
 * Apaga o estado de um utilizador (quando o agendamento termina)
 * @param {string} from
 */
function deleteState(from) {
  const allStates = readState();
  delete allStates[from];
  writeState(allStates);
}

// Inicializa o arquivo na primeira vez que o módulo é carregado
initializeState();

module.exports = {
  getState,
  setState,
  deleteState,
};