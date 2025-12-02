// src/config/database.js
const { Pool } = require('pg');
require('./env');

/**
 * Pool de conexões PostgreSQL.
 * Gerencia múltiplas conexões simultâneas de forma eficiente.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Máximo de clientes no pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err, client) => {
  console.error('❌ Erro inesperado no pool do PostgreSQL', err);
  // Não sair do processo em produção, apenas logar
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};