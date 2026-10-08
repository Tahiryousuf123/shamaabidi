require('../pipeline/config');
const Groq = require('groq-sdk');

async function listGroqModels() {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const list = await groq.models.list();
  console.log('Available Groq models:');
  for (const m of list.data) {
    console.log('-', m.id);
  }
}

listGroqModels().catch(console.error);
