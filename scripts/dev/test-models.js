require('../pipeline/config');
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  for (const m of ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b']) {
    try {
      const res = await groq.chat.completions.create({
        model: m,
        messages: [{ role: 'user', content: 'Say OK' }],
        max_tokens: 5,
      });
      console.log(`✅ Groq [${m}]:`, res.choices[0].message.content.trim());
    } catch (e) {
      console.log(`❌ Groq [${m}]:`, e.status, e.message);
    }
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  for (const m of ['gemini-2.5-flash', 'gemini-3.8-flash']) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const res = await model.generateContent('Say OK');
      console.log(`✅ Gemini [${m}]:`, res.response.text().trim());
    } catch (e) {
      console.log(`❌ Gemini [${m}]:`, e.status, e.message);
    }
  }
}

test();
