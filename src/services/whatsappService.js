const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

function createWhatsappClient(onMessageCallback) {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
  });

  client.on('qr', qr => {
    console.log('📲 Escaneie este QR Code com o WhatsApp:');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => console.log('✅ Bot conectado ao WhatsApp!'));
  client.on('auth_failure', msg => console.error('❌ Falha de autenticação:', msg));
  client.on('disconnected', reason => console.log('⚠️ Bot desconectado:', reason));
  client.on('message', msg => onMessageCallback(client, msg).catch(err => console.error(err)));

  client.initialize();
  return client;
}

module.exports = { createWhatsappClient };
