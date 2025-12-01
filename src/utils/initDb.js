const db = require('../config/database');

async function initDb() {
  try {
    console.log('🔄 Atualizando estrutura do Banco de Dados...');

    // Cria a tabela se não existir
    await db.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        summary VARCHAR(255),
        description TEXT,
        status VARCHAR(50) DEFAULT 'agendado',
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // --- MIGRAÇÃO: Ajusta as colunas conforme pedido ---
    try {
        // 1. Remove a coluna 'phone' antiga se existir
        await db.query(`ALTER TABLE appointments DROP COLUMN IF EXISTS phone;`);

        // 2. Adiciona as colunas corretas
        await db.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_name VARCHAR(255);`);
        await db.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_name VARCHAR(255);`);
        await db.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_phone VARCHAR(50);`);
        
        // 3. Garante que o status padrão seja 'agendado'
        await db.query(`ALTER TABLE appointments ALTER COLUMN status SET DEFAULT 'agendado';`);
        
    } catch (e) {
        console.log('Nota: Colunas já ajustadas ou erro na migração:', e.message);
    }

    // Outras tabelas (sem alterações)
    await db.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS memory (
        phone VARCHAR(50) PRIMARY KEY,
        history JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

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