import { GoogleGenerativeAI } from '@google/generative-ai';

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey!);
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-3.5-flash' });
  const res = await model.generateContent('Extract JSON: {"status": "ok"} from this test');
  console.log('Gemini output:', res.response.text());
}

testGemini();
