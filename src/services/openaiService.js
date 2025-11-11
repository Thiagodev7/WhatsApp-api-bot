const OpenAI = require('openai');
const { openaiApiKey, systemPrompt } = require('../config/env');

const openai = new OpenAI({ apiKey: openaiApiKey });

async function generateReply(history) {
  const messages = [{ role: 'system', content: systemPrompt }, ...history];
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 400,
  });
  return (completion.choices[0]?.message?.content || '').trim();
}

module.exports = { generateReply };
