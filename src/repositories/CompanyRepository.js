const db = require('../config/database');

class CompanyRepository {
    static async getAllActive() {
        const res = await db.query("SELECT * FROM companies WHERE status = 'active'");
        return res.rows;
    }

    static async getById(id) {
        const res = await db.query("SELECT * FROM companies WHERE id = $1", [id]);
        return res.rows[0];
    }

    // Métodos para buscar configurações da empresa
    static async getSettings(companyId) {
        const res = await db.query("SELECT key, value FROM settings WHERE company_id = $1", [companyId]);
        return res.rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
    }
    
    static async updateSetting(companyId, key, value) {
        await db.query(
            `INSERT INTO settings (company_id, key, value) VALUES ($1, $2, $3)
             ON CONFLICT (company_id, key) DO UPDATE SET value = $3`,
            [companyId, key, value]
        );
    }
}

module.exports = CompanyRepository;