const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'respostas.json');

function loadRespostas() {
    if (!fs.existsSync(FILE_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
    } catch (error) {
        return {};
    }
}

function saveRespostas(data) {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
}

function addResposta(key, value) {
    const data = loadRespostas();
    data[key.toLowerCase()] = value;
    saveRespostas(data);
}

function removeResposta(key) {
    const data = loadRespostas();
    delete data[key.toLowerCase()];
    saveRespostas(data);
}

function getRespostas() {
    return loadRespostas();
}

function listRespostas() {
    const data = loadRespostas();
    return Object.entries(data).map(([k, v]) => `${k}: ${v}`);
}

module.exports = { addResposta, removeResposta, getRespostas, listRespostas };