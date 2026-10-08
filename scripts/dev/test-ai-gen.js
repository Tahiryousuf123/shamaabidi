require('../pipeline/config');
const Groq = require('groq-sdk');
const { SENDER_SIGNATURE } = require('../pipeline/config');

const candidate = {
  name: 'J. I. Yi',
  surname: 'Yi',
  ownerSurname: 'Yi',
  institution: 'Pusan National University Hospital',
  paperTitle: 'Rapid microbiological diagnostics for sepsis in critical care: integrating technological advances with antimicrobial stewardship',
  abstract: 'Sepsis in critical care requires rapid microbiological diagnostics and antimicrobial stewardship to prevent resistance and improve patient outcomes.',
  relevanceScore: 70,
};

function validate(text, title) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  console.log('Total words:', words);
  const titleWords = title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const bodyWithoutQuoted = text.replace(new RegExp(`"${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'gi'), '');
  const bodyNorm = bodyWithoutQuoted.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  for (let i = 0; i <= titleWords.length - 4; i++) {
    const p = titleWords.slice(i, i + 4).join(' ');
    if (bodyNorm.includes(` ${p} `)) {
      console.log('FAILED: 4-word title fragment found:', p);
      return false;
    }
  }
  return true;
}

async function testGeneration() {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const cleanPaperTitle = candidate.paperTitle.trim();
  const surname = 'Yi';

  const promptSystem = `You are Dr. Shama Abidi writing a concise PhD prospective inquiry email to a professor.
You must use ONLY facts from Dr. Shama's profile and the stored paper abstract below.

DR. SHAMA PROFILE FACTS:
- Senior Clinical Pharmacist at Liaquat National Hospital, Karachi, Pakistan (17+ years experience)
- MPhil in Pharmacy Practice
- Published clinical trials:
  * Carbapenem antimicrobial stewardship trial on de-escalation protocols and microbiological concordance (Ali et al., 2022)
  * Inpatient high-alert medication safety monitoring (Baig et al., 2025)
  * Cardiovascular pharmacotherapy comparing calcium channel blockers vs beta-blockers (Abidi et al., 2024)
- Research focus: Clinical pharmacy practice and hospital implementation science

CANDIDATE'S STORED PAPER:
- Title: "${cleanPaperTitle}"
- Abstract: "${candidate.abstract}"

CRITICAL PROMPT RULES:
1. Quote the exact stored paper title once: "${cleanPaperTitle}" in quotes. Never alter it. Never use fragments of the title elsewhere in the email.
2. Include exactly ONE concrete sentence that refers to a specific element of THIS paper's abstract (setting, method, population or finding) and links it to a matching real trial from Dr. Shama's profile.
3. No invented numbers, percentages, dates, results, journals, or claims. Every number used MUST appear in the abstract or in Dr. Shama's profile above.
4. Keep the body length strictly around 115-125 words (so total email including greeting and signature is 140-160 words).
5. Polite, specific, academic tone.
6. End with this exact opt-out sentence:
"If this is not relevant to your work, just let me know and I will not write again."
7. Output ONLY in this format:
SUBJECT: PhD research enquiry – clinical pharmacy and antimicrobial stewardship (Dr. Shama Abidi)
BODY:
[Body text paragraphs only, WITHOUT salutation or sign-off/signature]`;

  const res = await groq.chat.completions.create({
    model: 'qwen/qwen3.8-27b',
    messages: [
      { role: 'system', content: promptSystem },
      { role: 'user', content: `Please compose the inquiry email body for Dr. ${surname}.` },
    ],
    temperature: 0.3,
    max_tokens: 500,
  });

  const raw = res.choices[0].message.content;
  const bodyMatch = raw.match(/BODY:\s*([\s\S]+)/i);
  let body = (bodyMatch ? bodyMatch[1] : raw).trim();
  body = body.replace(/^Dear\s+[^,\n]+,\s*/i, '').trim();
  body = body.replace(/(Sincerely|Kind regards|Best regards|Warm regards|Regards)[\s\S]*$/i, '').trim();
  if (!body.includes('If this is not relevant to your work')) {
    body += '\n\nIf this is not relevant to your work, just let me know and I will not write again.';
  }

  const fullEmail = `Dear Dr. ${surname},\n\n${body}\n\n${SENDER_SIGNATURE}`;
  console.log('--- Full Email ---');
  console.log(fullEmail);
  console.log('--- Validator ---');
  validate(fullEmail, cleanPaperTitle);
}

testGeneration();
