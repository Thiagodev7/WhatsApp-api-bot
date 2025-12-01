const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCodeImage = require('qrcode');

function createWhatsappClient(onMessageCallback, io) {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    },
  });

  client.on('qr', async (qr) => {
    console.log('📲 QR Code recebido (Terminal)');
    qrcode.generate(qr, { small: true });
    
    if (io) {
        try {
            const url = await QRCodeImage.toDataURL(qr);
            io.emit('qr', url);
        } catch (err) {
            console.error('Erro ao gerar QR Code web:', err);
        }
    }
  });

  client.on('ready', () => {
    console.log('✅ Bot conectado!');
    if (io) io.emit('ready', true);
  });

  client.on('auth_failure', msg => console.error('❌ Falha de autenticação:', msg));
  
  client.on('disconnected', reason => {
      console.log('⚠️ Bot desconectado:', reason);
      if (io) io.emit('disconnected');
  });

  client.on('message', msg => {
      if (io) {
          try {
              const number = msg.from.replace('@c.us', '');
              const preview = msg.body.length > 50 ? msg.body.substring(0, 50) + '...' : msg.body;
              if(msg.body) {
                  io.emit('real_log', {
                      type: 'incoming',
                      text: `[${number}]: ${preview}`
                  });
              }
          } catch (e) {
              console.error('Erro no log espião:', e);
          }
      }

      // --- MUDANÇA: Passamos o IO para o handler ---
      onMessageCallback(client, msg, io).catch(err => console.error(err));
  });

  client.initialize();
  return client;
}

module.exports = { createWhatsappClient };