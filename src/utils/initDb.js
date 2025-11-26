const db = require('../config/database');

async function initDb() {
  try {
    console.log('🔄 Verificando tabelas do Banco de Dados...');

    // Tabela de Configurações
    await db.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Tabela de Agendamentos
    await db.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        summary VARCHAR(255),
        description TEXT,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // [NOVO] Tabela de Memória (Histórico de Conversa)
    await db.query(`
      CREATE TABLE IF NOT EXISTS memory (
        phone VARCHAR(50) PRIMARY KEY,
        history JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // [NOVO] Tabela de Estado (Fluxo de Agendamento)
    await db.query(`
      CREATE TABLE IF NOT EXISTS booking_state (
        phone VARCHAR(50) PRIMARY KEY,
        state JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Banco de Dados pronto!');
  } catch (error) {
    console.error('❌ ERRO CRÍTICO ao iniciar banco:', error);
  }
}

module.exports = initDb;