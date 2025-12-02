// src/database/initDb.js
const db = require('../config/database');

async function initDb() {
  try {
    console.log('🔄 [DB] Inicializando Schema Multi-Tenant...');

    await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    // 1. Tabela Tenants (Empresas)
    await db.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        whatsapp_number VARCHAR(50) UNIQUE, -- Identificador da sessão
        plan VARCHAR(50) DEFAULT 'free',
        status VARCHAR(50) DEFAULT 'active', -- active, inactive, banned
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Tabela Configurações (Settings)
    await db.query(`
      CREATE TABLE IF NOT EXISTS settings (
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        key VARCHAR(100) NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (company_id, key)
      );
    `);

    // 3. Tabela Agendamentos
    await db.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        client_name VARCHAR(255),
        client_phone VARCHAR(50),
        service_name VARCHAR(255),
        summary VARCHAR(255),
        description TEXT,
        status VARCHAR(50) DEFAULT 'agendado',
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_appointments_company_date ON appointments(company_id, start_time);`);

    // 4. Memória de Chat
    await db.query(`
      CREATE TABLE IF NOT EXISTS chat_memory (
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        phone VARCHAR(50) NOT NULL,
        history JSONB NOT NULL DEFAULT '[]',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (company_id, phone)
      );
    `);

    console.log('✅ [DB] Schema verificado com sucesso.');
    
    // Cria empresa padrão se não existir (Seed)
    const check = await db.query("SELECT id FROM companies LIMIT 1");
    if (check.rowCount === 0) {
        const newComp = await db.query(
            "INSERT INTO companies (name, whatsapp_number) VALUES ($1, $2) RETURNING id",
            ['Empresa Demo', 'DEMO_SESSION']
        );
        console.log(`🚀 [SEED] Empresa Demo Criada: ${newComp.rows[0].id}`);
    }

  } catch (error) {
    console.error('❌ [DB] Erro fatal na inicialização:', error);
    process.exit(1);
  }
}

module.exports = initDb;