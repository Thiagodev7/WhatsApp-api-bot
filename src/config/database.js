const { Pool } = require('pg');
require('./env'); 

// Cria a conexão usando a URL do seu .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Se for usar na nuvem (VPS/Render) com SSL, descomente a linha abaixo:
  // ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('connect', () => {
  // Conexão bem sucedida silenciosa
});

pool.on('error', (err) => {
  console.error('❌ Erro inesperado no cliente do Banco de Dados', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};