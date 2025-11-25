const path = require('path');
const dotenv = require('dotenv');

// Carrega o .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

module.exports = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID,
  // Removemos systemPrompt, allowedNumbers e limites daqui
  // pois agora virão do Banco de Dados Dinâmico
};