import Groq from 'groq-sdk';

async function listGroqModels() {
  const apiKey = process.env.GROQ_API_KEY;
  const groq = new Groq({ apiKey });
  const list = await groq.models.list();
  console.log('Available Groq models:', list.data.map(m => m.id));
}

listGroqModels();
