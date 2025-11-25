const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCodeImage = require('qrcode'); // Nova lib para gerar imagem

// Agora a função recebe 'io' (o servidor do socket) como argumento opcional
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
    qrcode.generate(qr, { small: true }); // Mantém no terminal

    // Se tivermos uma conexão Socket.io, enviamos a imagem para o site
    if (io) {
        try {
            // Gera uma imagem base64 para exibir no navegador
            const url = await QRCodeImage.toDataURL(qr);
            io.emit('qr', url);
        } catch (err) {
            console.error('Erro ao gerar QR Code para web:', err);
        }
    }
  });

  client.on('ready', () => {
    console.log('✅ Bot conectado ao WhatsApp!');
    if (io) io.emit('ready', true); // Avisa o site que conectou
  });

  client.on('auth_failure', msg => console.error('❌ Falha de autenticação:', msg));
  client.on('disconnected', reason => console.log('⚠️ Bot desconectado:', reason));
  
  client.on('message', msg => onMessageCallback(client, msg).catch(err => console.error(err)));

  client.initialize();
  return client;
}

module.exports = { createWhatsappClient };