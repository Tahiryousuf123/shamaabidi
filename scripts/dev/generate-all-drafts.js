const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');

// Load .env.local
const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const key = (process.env.FIREBASE_PRIVATE_KEY || '').trim().replace(/\\n/g, '\n');
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: (process.env.FIREBASE_PROJECT_ID || 'shamaabidi-3ddf8').trim(),
    clientEmail: (process.env.FIREBASE_CLIENT_EMAIL || '').trim(),
    privateKey: key,
  })
});

const db = admin.firestore();

const SHAMA_PROFILE_CONTEXT = `
Candidate Name: Dr. Shama Abidi
Current Role: Senior Clinical Pharmacist at Liaquat National Hospital & Medical College, Karachi, Pakistan (since August 2007)
Leadership: Vice President, Pakistan Pharmacist Association (PPA), Sindh Cabinet (Appointed 2023)
Education:
- MPhil in Pharmacy Practice, Faculty of Pharmacy & Pharmaceutical Sciences, University of Karachi (Completed Nov 2024). Thesis: "Effectiveness and Safety Assessment of Calcium Channel Blockers Compared to Beta Blockers in Patients with Angina" (Supervisor: Dr. Saira Saeed Khan)
- Doctor of Pharmacy (PharmD), Federal Urdu University of Arts, Sciences & Technology (2019)
- Bachelor of Pharmacy (B-Pharm), University of Karachi (2007)

Key Clinical & Research Expertise:
- Tertiary care hospital clinical pharmacy, ICU/HDU ward rounds, therapeutic drug monitoring, renal and hepatic dose adjustments.
- Lead clinical pharmacist in Antimicrobial Stewardship Program (ASP) since 2018; evaluated carbapenem use, de-escalation, culture & sensitivity (C/S) concordance, and clinical outcomes.
- Medication safety, high-alert medications (HAM), and adverse drug reaction (ADR) causality assessment using the Naranjo scale.
- Health services implementation research, cross-sectional surveys, prospective interventional clinical studies.
- Artificial intelligence & digital health in clinical pharmacy decision support (evaluating LLMs/ChatGPT in clinical medication therapy management).

Key Peer-Reviewed Publications & Presentations:
1. Abidi S, Saeed Khan S, Naeem S, Siddiqui H, Khadim S, Saleem S, et al. (2024). "Effectiveness and safety assessment of calcium channel blockers compared to beta blockers in patients with angina: An observational study." Pakistan Journal of Pharmaceutical Sciences, 37(3):639-649.
2. Ali F, Zehra T, Solangi NA, Makki KU, Siddiqui HA, Abidi S. (2022). "Evaluation of carbapenem antimicrobial stewardship program at a tertiary care hospital: A prospective interventional study." Pakistan Journal of Pharmaceutical Sciences, 35(6):1595-1601.
3. Baig F, Siddiqui HA, Bilekhia A, Abidi S, Ahmed S. (2025). "AI meets human expertise: Comparison between clinical pharmacist interventions and artificial intelligence at a tertiary care hospital in Pakistan." Journal of Pharmaceutical Policy and Practice / FIP, 18(Suppl 2):2485639.
4. Baig F, Bilekhia A, Abidi S, Ahmed S. (2025). "Evaluating knowledge of high-alert medications among nurses, pharmacists, and clinicians to improve medication safety." Journal of Pharmaceutical Policy and Practice, 18(Suppl 2):2485639.
5. Abidi S. (2026). "Exploring the landscape of evidence based pharmacy practice in Pakistan: Insights into knowledge, attitudes and implementation barriers." FIP Montreal 2026, World Congress of Pharmacy and Pharmaceutical Sciences.

PhD Objective:
Seeking a fully-funded international PhD position aligned with clinical pharmacy, antimicrobial stewardship, medication safety, pharmacy practice implementation science, or digital/AI health in hospital pharmacy.
`;

async function generateEmailForProfessor(prof) {
  const profName = prof.name || 'Professor';
  const university = prof.university || 'University';
  const researchArea = prof.researchArea || 'clinical pharmacy';
  const recentPaper = prof.recentPaper || 'recent research';

  const systemPrompt = `You are an assistant helping Dr. Shama Abidi, an experienced clinical pharmacist and MPhil researcher from Pakistan, write a highly tailored, authentic, intellectual, and concise inquiry email to an academic professor regarding fully-funded PhD opportunities in their research group.

Guidelines:
- Maximum 130-160 words for the body.
- Be concise, direct, respectful, and intellectually grounded.
- Mention the professor's recent paper: "${recentPaper}" and specifically connect it to Shama's clinical research experience (e.g. her hospital antimicrobial stewardship trials, cardiovascular observational study, or medication safety work).
- State clearly that she holds an MPhil in Pharmacy Practice and 17 years tertiary hospital experience, seeking a fully-funded PhD opening.
- Inquire respectfully about whether they are accepting funded PhD students for upcoming intakes.
- NEVER use generic flattery clichés (e.g. "I hope this email finds you well", "I was blown away by your illustrious work", "world-renowned expert").
- Do NOT include greeting (salutation) or sign-off/signature in the BODY, as the system appends them automatically. Return only the core body paragraphs.
- Return format:
SUBJECT: [compelling, specific subject line]
BODY:
[body paragraphs]`;

  const userPrompt = `Professor: ${profName}
University: ${university}
Research Area: ${researchArea}
Recent Paper: "${recentPaper}"

Candidate Profile:
${SHAMA_PROFILE_CONTEXT}

Write the email subject and body.`;

  // Try Groq first for ultra-fast generation
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
        max_tokens: 450,
        temperature: 0.7,
      });
      const text = completion.choices[0]?.message?.content ?? '';
      if (text && text.trim().length > 20) {
        return parseEmailOutput(text, university, profName);
      }
    } catch (err) {}
  }

  // Fallback to Gemini
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    const candidateModels = [
      process.env.GEMINI_MODEL,
      'gemini-flash-latest',
      'gemini-2.5-flash-lite',
      'gemini-3.8-flash',
    ].filter(Boolean);

    const genAI = new GoogleGenerativeAI(geminiApiKey);

    for (const m of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({ model: m });
        const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
        const text = result.response.text();
        if (text && text.trim().length > 20) {
          return parseEmailOutput(text, university, profName);
        }
      } catch (err) {
        // try next
      }
    }
  }

  // Clean fallback
  return {
    subject: `PhD Research Inquiry: ${researchArea || 'Clinical Pharmacy'} – ${university}`,
    body: `I am writing to respectfully inquire about fully-funded PhD opportunities within your research group at ${university}. I have been following your scholarly work, particularly your publication "${recentPaper}", which strongly connects with my research experience in ${researchArea}.\n\nI hold an MPhil in Pharmacy Practice from the University of Karachi and have served as a Senior Clinical Pharmacist at Liaquat National Hospital for over 17 years, leading antimicrobial stewardship and medication safety initiatives with multiple peer-reviewed publications.\n\nCould you please let me know if you are currently considering prospective PhD candidates for upcoming fully-funded openings? I would be honored to discuss how my research background aligns with your ongoing projects.`,
  };
}

function parseEmailOutput(text, university, profName) {
  const subjectMatch = text.match(/SUBJECT:\s*(.+)/i);
  const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i);

  const subject = subjectMatch?.[1]?.trim() ?? `PhD Inquiry: Clinical Pharmacy & Practice – ${university}`;
  let body = bodyMatch?.[1]?.trim() ?? text.replace(/SUBJECT:.+/i, '').replace(/BODY:/i, '').trim();

  body = body.replace(/^(Dear|Hello|Hi)\s+[^,\n]+,\s*/i, '');
  body = body.replace(/\n\s*(Sincerely|Best regards|Kind regards|Warm regards|Regards)[\s\S]*$/i, '').trim();

  return { subject, body };
}

function constructFullEmailMessage(bodyContent, profName) {
  const cleanName = profName.replace(/^Dr\.\s*|^Prof\.\s*/i, '').trim();
  const lastName = cleanName.split(' ').slice(-1)[0];

  return `Dear Dr. ${lastName},

${bodyContent}

Kind regards,
Dr. Shama Abidi
Clinical Pharmacist | MPhil Pharmacy Practice
Liaquat National Hospital, Karachi, Pakistan
Email: shamaabidiphd@gmail.com
ORCID: 0009-0008-3714-1675`;
}

async function run() {
  console.log('🚀 Starting Batch Draft Generation for All Professors with Email Addresses...');

  const profsSnap = await db.collection('professors').get();
  const eligibleProfs = [];
  profsSnap.forEach(d => {
    const data = d.data();
    if (data.email && data.email.includes('@')) {
      eligibleProfs.push({ id: d.id, ...data });
    }
  });

  console.log(`Found ${eligibleProfs.length} professors with valid email addresses.`);

  let createdCount = 0;
  let existingCount = 0;

  for (let i = 0; i < eligibleProfs.length; i++) {
    const prof = eligibleProfs[i];
    const emailsSnap = await db.collection('emails')
      .where('professorId', '==', prof.id)
      .where('status', '==', 'draft')
      .limit(1)
      .get();

    if (!emailsSnap.empty) {
      existingCount++;
      // Make sure professor status is at least 'draft'
      if (prof.status !== 'sent' && prof.status !== 'followup_sent' && prof.status !== 'draft') {
        await db.collection('professors').doc(prof.id).update({ status: 'draft' });
      }
      continue;
    }

    console.log(`[${i + 1}/${eligibleProfs.length}] Generating draft for: ${prof.name} (${prof.university})...`);
    const emailRes = await generateEmailForProfessor(prof);
    const fullBody = constructFullEmailMessage(emailRes.body, prof.name);

    await db.collection('emails').add({
      professorId: prof.id,
      type: 'first',
      subject: emailRes.subject,
      body: fullBody,
      status: 'draft',
      sentAt: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (prof.status !== 'sent' && prof.status !== 'followup_sent') {
      await db.collection('professors').doc(prof.id).update({ status: 'draft' });
    }

    createdCount++;
    // Brief 500ms pacing between LLM calls
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n🎉 Done! Created ${createdCount} new drafts. Existing drafts: ${existingCount}. Total ready: ${createdCount + existingCount}`);
}

run().catch(console.error);
