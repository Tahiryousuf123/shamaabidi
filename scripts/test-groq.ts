import Groq from 'groq-sdk';

async function testGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  const groq = new Groq({ apiKey });
  const completion = await groq.chat.completions.create({
    messages: [{ role: 'user', content: 'Say "Groq is working!"' }],
    model: 'llama-3.3-70b-versatile',
  });
  console.log('Groq response:', completion.choices[0]?.message?.content);
}

testGroq();
