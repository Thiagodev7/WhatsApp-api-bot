// src/utils/respostaManager.js
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(process.cwd(), 'respostas.json');

// garante que o arquivo existe
if (!fs.existsSync(FILE_PATH)) {
  fs.writeFileSync(FILE_PATH, JSON.stringify({}, null, 2));
}

/**
 * Lê todas as respostas prontas
 */
function getRespostas() {
  const data = fs.readFileSync(FILE_PATH, 'utf8');
  return JSON.parse(data || '{}');
}

/**
 * Adiciona ou atualiza uma resposta
 */
function addResposta(chave, texto) {
  const respostas = getRespostas();
  respostas[chave.toLowerCase()] = texto;
  fs.writeFileSync(FILE_PATH, JSON.stringify(respostas, null, 2));
}

/**
 * Remove uma resposta pelo nome
 */
function removeResposta(chave) {
  const respostas = getRespostas();
  delete respostas[chave.toLowerCase()];
  fs.writeFileSync(FILE_PATH, JSON.stringify(respostas, null, 2));
}

/**
 * Lista as chaves disponíveis
 */
function listRespostas() {
  const respostas = getRespostas();
  return Object.keys(respostas);
}

/**
 * Busca uma resposta que contenha a chave no texto
 */
function findResposta(text) {
  const respostas = getRespostas();
  const lower = text.toLowerCase();
  const key = Object.keys(respostas).find((k) => lower.includes(k));
  return key ? respostas[key] : null;
}

module.exports = {
  getRespostas,
  addResposta,
  removeResposta,
  listRespostas,
  findResposta,
};