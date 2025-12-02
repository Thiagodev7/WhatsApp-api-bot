const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCodeImage = require('qrcode');
const CompanyRepository = require('../repositories/CompanyRepository');
const { handleIncomingMessage } = require('../handlers/messageHandler');

class WhatsAppManager {
    constructor(io) {
        this.io = io;
        this.sessions = new Map(); // Armazena { companyId: ClientInstance }
    }

    /**
     * Inicia todas as sessões ativas no banco de dados
     */
    async initializeAll() {
        const companies = await CompanyRepository.getAllActive();
        console.log(`hz [Manager] Iniciando ${companies.length} empresas...`);
        
        for (const company of companies) {
            this.startSession(company);
        }
    }

    /**
     * Inicia uma sessão específica
     */
    startSession(company) {
        if (this.sessions.has(company.id)) {
            console.log(`⚠️ [Manager] Sessão ${company.name} já está rodando.`);
            return;
        }

        console.log(`🚀 [Manager] Iniciando bot: ${company.name}`);

        const client = new Client({
            authStrategy: new LocalAuth({ 
                clientId: company.id // Importante: Pasta separada por empresa
            }),
            puppeteer: { 
                headless: true, 
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            }
        });

        // Eventos do Cliente
        client.on('qr', async (qr) => {
            console.log(`📲 [${company.name}] QR Code gerado`);
            try {
                const url = await QRCodeImage.toDataURL(qr);
                // Emite para o frontend apenas para o canal desta empresa (room)
                this.io.to(company.id).emit('qr_code', { url, companyId: company.id });
            } catch (e) { console.error(e); }
        });

        client.on('ready', () => {
            console.log(`✅ [${company.name}] WhatsApp Conectado!`);
            this.io.to(company.id).emit('status_change', { status: 'ONLINE', companyId: company.id });
        });

        client.on('disconnected', (reason) => {
            console.log(`❌ [${company.name}] Desconectado: ${reason}`);
            this.io.to(company.id).emit('status_change', { status: 'OFFLINE', companyId: company.id });
            // Lógica de reconexão automática poderia entrar aqui
        });

        // Injeção de Dependência: Passa o IO e o ID da empresa para o Handler
        client.on('message', (msg) => {
            // Envia log em tempo real
            this.io.to(company.id).emit('new_log', { 
                text: `[Cliente]: ${msg.body.substring(0,50)}...` 
            });
            
            handleIncomingMessage(client, msg, this.io, company.id);
        });

        // Inicializa e salva no mapa
        client.initialize();
        this.sessions.set(company.id, client);
    }

    /**
     * Reinicia uma sessão (Útil para logout/login)
     */
    async restartSession(companyId) {
        const client = this.sessions.get(companyId);
        if (client) {
            await client.destroy();
            this.sessions.delete(companyId);
        }
        const company = await CompanyRepository.getById(companyId);
        if (company) this.startSession(company);
    }
}

module.exports = WhatsAppManager;