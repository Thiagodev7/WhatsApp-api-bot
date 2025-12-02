const { generateReply } = require('../services/geminiService');
const AgendaService = require('../services/localCalendarService'); // Refatorar para classe
const ChatMemory = require('../repositories/ChatMemoryRepository'); // Criar este repo
const CompanyRepo = require('../repositories/CompanyRepository');

async function handleIncomingMessage(client, message, io, companyId) {
    try {
        if (message.fromMe || message.isStatus) return;

        const contact = await message.getContact();
        const phone = contact.number;
        const text = message.body;

        // 1. Carregar Configurações da Empresa (Cachear isso seria ideal)
        const settings = await CompanyRepo.getSettings(companyId);
        
        // 2. Verificações de Segurança (Whitelist)
        const allowed = settings['config_numeros'];
        if (allowed && !allowed.includes(phone)) return;

        // 3. Histórico de Conversa
        const history = await ChatMemory.get(companyId, phone);
        
        // 4. Processamento Inteligente (IA)
        // Passamos o companyId para o serviço saber de qual agenda buscar
        const response = await generateReply(history, text, companyId, settings);

        // 5. Execução de Comandos (Se a IA retornar JSON de agendamento)
        if (response.action === 'AGENDAR') {
            const result = await AgendaService.createAppointment(companyId, response.data);
            await message.reply(`✅ Agendamento confirmado para ${result.date} às ${result.time}!`);
        } else {
            // Resposta normal
            await message.reply(response.text);
        }

        // 6. Salvar Histórico
        await ChatMemory.add(companyId, phone, { role: 'user', content: text });
        await ChatMemory.add(companyId, phone, { role: 'model', content: response.text });

    } catch (error) {
        console.error(`[${companyId}] Erro no handler:`, error);
    }
}

module.exports = { handleIncomingMessage };