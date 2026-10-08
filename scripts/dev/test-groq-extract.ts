import Groq from 'groq-sdk';

async function testGroqExtract() {
  const apiKey = process.env.GROQ_API_KEY;
  const groq = new Groq({ apiKey });

  const sampleAd = `
Title: Antimicrobial resistance and gene regulation in Enteroaggregative Escherichia coli.
Institution: Aston University, College of Health and Life Sciences
Supervisor: Dr Douglas Browning
Applications accepted all year round
Funded PhD Project (Students Worldwide)
Overseas applicants may apply for this studentship but will need to pay the difference between the ‘Home’ and the ‘Overseas’ tuition fees. Currently the difference is £17,712 for 2026/7.
For formal enquiries about this project contact Dr Douglas Browning at d.browning@aston.ac.uk
`;

  const prompt = `You are an accurate academic data extractor. Extract ONLY text that literally appears in the advertisement below. Do NOT fabricate, assume, or invent anything. If a field does not literally appear, return null or empty string.

Ad Text:
${sampleAd}

Respond in strict JSON with these keys:
{
  "supervisorName": "literal supervisor name or null",
  "university": "literal university name or null",
  "fundingType": "literal funding type stated (e.g. Fully funded, PhD Studentship, etc) or null",
  "fundingAmount": "literal stipend or funding amount if stated, or null",
  "isFunded": true/false (true if literally stated as funded/studentship/scholarship),
  "isSelfFunded": true/false (true if stated as self-funded only),
  "eligibility": "literal text about eligibility / nationality or null",
  "internationalAllowed": true/false (false only if explicitly restricted to Home/UK or international explicitly excluded),
  "deadline": "literal deadline text or null",
  "deadlineDate": "YYYY-MM-DD if explicit date mentioned, or null",
  "contactEmail": "literal email found in ad or null"
}`;

  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are an exact JSON extractor. Output valid JSON only, no markdown, no explanation.' },
      { role: 'user', content: prompt }
    ],
    model: 'qwen/qwen3.8-27b',
    response_format: { type: 'json_object' }
  });

  console.log('JSON extracted:');
  console.log(completion.choices[0]?.message?.content);
}

testGroqExtract();
