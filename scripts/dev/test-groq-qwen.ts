import Groq from 'groq-sdk';

async function testGroqQwen() {
  const apiKey = process.env.GROQ_API_KEY;
  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    messages: [{ role: 'user', content: 'Say "Groq Qwen is working!"' }],
    model: 'qwen/qwen3.8-27b',
  });
  console.log('Groq response:', completion.choices[0]?.message?.content);
}

testGroqQwen();
