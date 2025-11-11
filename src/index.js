const { createWhatsappClient } = require('./services/whatsappService');
require('./config/env');
const { handleIncomingMessage } = require('./handlers/messageHandler');

function main() {
  console.log('🚀 Iniciando bot de WhatsApp com IA...');
  createWhatsappClient(handleIncomingMessage);
}

main();
