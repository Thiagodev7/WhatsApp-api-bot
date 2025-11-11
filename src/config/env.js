const dotenv = require('dotenv');
dotenv.config();

const geminiApiKey = process.env.GEMINI_API_KEY;
const systemPrompt =
  process.env.SYSTEM_PROMPT ||
  'Você é um assistente virtual. Responda em português, de forma educada e objetiva.';

const allowedNumbers = process.env.ALLOWED_NUMBERS
  ? process.env.ALLOWED_NUMBERS.split(',').map((n) => n.trim())
  : null;

const dailyMessageLimit = parseInt(process.env.DAILY_MESSAGE_LIMIT || '200', 10);
const dailyCharLimit = parseInt(process.env.DAILY_CHAR_LIMIT || '20000', 10);

if (!geminiApiKey) {
  console.error('❌ Erro: GEMINI_API_KEY não definida no arquivo .env');
  process.exit(1);
}

module.exports = {
  geminiApiKey,
  systemPrompt,
  allowedNumbers,
  dailyMessageLimit,
  dailyCharLimit,
};