const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const { db, FieldValue, getCvAttachment } = require('./db');
const {
  DAILY_TARGET,
  DAILY_MIN,
  DAILY_MAX,
  DRAFT_BUDGET_MIN,
  GENERATION_GAP_SEC,
  RELEVANCE_STRONG,
  PERSONAL_DOMAINS,
  PERSONAL_MAX_SHARE,
  SHAMA_PROFILE,
  SENDER_SIGNATURE,
  sha1,
  normalizeKey,
  extractDomain,
  sleep,
} = require('./config');

// ─── Deterministic String Hash Helper ─────────────────────────────────────────
function stringHash(str) {
  let hash = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// ─── Name & Salutation Parsing Helpers (Requirement 4 & 5) ─────────────────────
function parseAuthorSurname(name) {
  if (!name || typeof name !== 'string') return '';
  let clean = name.replace(/^Dr\.\s*|^Prof\.\s*|^Professor\s*/i, '').trim();
  if (clean.includes(',')) {
    return clean.split(',')[0].trim();
  }
  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return tokens[0];
  if (/^[A-Z]{1,3}\.?$/.test(tokens[tokens.length - 1])) {
    return tokens.slice(0, -1).join(' ');
  }
  if (/^[A-Z]\.?$/i.test(tokens[0]) && tokens.length === 2) {
    return tokens[1];
  }
  return tokens[tokens.length - 1];
}

function parseAuthorSalutation(candidate) {
  // Salutation always uses the owner's JATS <surname> if available
  const surname = candidate.ownerSurname || parseAuthorSurname(candidate.name);
  const isProf = Boolean(
    candidate.title === 'Professor' ||
      candidate.isProfessor === true ||
      candidate.academicRole?.toLowerCase().includes('professor') ||
      (candidate.emailSource === 'faculty-page' && /\b(prof\.|professor)\b/i.test(candidate.name || ''))
  );
  if (surname && surname.length >= 2) {
    const prefix = isProf ? 'Professor' : 'Dr.';
    return `Dear ${prefix} ${surname},`;
  }
  return `Dear Dr. ${candidate.name},`;
}

// ─── Stale Claims Auto-Release (older than 1 hour) ─────────────────────────────
async function autoReleaseStaleClaims() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  try {
    const profSnap = await db.collection('professors').where('status', '==', 'claimed').get();
    for (const doc of profSnap.docs) {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || 0);
      if (createdAt < oneHourAgo) {
        console.log(`   🔓 Auto-releasing stale claimed professor doc: ${doc.id}`);
        await doc.ref.delete().catch(() => {});
      }
    }

    const seenSnap = await db.collection('seen_professors').where('status', '==', 'claimed').get();
    for (const doc of seenSnap.docs) {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || 0);
      if (createdAt < oneHourAgo) {
        console.log(`   🔓 Auto-releasing stale claimed seen_professors doc: ${doc.id}`);
        await doc.ref.delete().catch(() => {});
      }
    }
  } catch (err) {
    console.warn('   ⚠️ Warning during autoReleaseStaleClaims:', err.message);
  }
}

// ─── Topic Categorization & Hand-Written Category Sentences (Requirement 2) ───
function detectTopicCategory(candidate) {
  const text = `${candidate.paperTitle || ''} ${candidate.abstract || ''} ${(candidate.topics || []).join(' ')}`.toLowerCase();
  if (text.includes('antimicrobial stewardship') || text.includes('carbapenem') || text.includes('de-escalat')) {
    return 'antimicrobial_stewardship';
  }
  if (text.includes('antibiotic') || text.includes('prescribing') || text.includes('resistance')) {
    return 'antibiotic_prescribing';
  }
  if (text.includes('medication safety') || text.includes('high-alert') || text.includes('adverse drug') || text.includes('pharmacovigilance') || text.includes('error')) {
    return 'medication_safety';
  }
  if (text.includes('cardiovascular') || text.includes('calcium channel') || text.includes('beta-blocker') || text.includes('hypertension') || text.includes('heart failure')) {
    return 'cardiovascular';
  }
  if (text.includes('decision support') || text.includes('digital health') || text.includes('artificial intelligence') || text.includes('telepharmacy')) {
    return 'digital_decision_support';
  }
  if (text.includes('pharmacy practice') || text.includes('implementation science') || text.includes('clinical pharmacy')) {
    return 'pharmacy_practice_implementation';
  }
  return 'other';
}

const CATEGORY_LABELS = {
  antimicrobial_stewardship: 'antimicrobial stewardship',
  antibiotic_prescribing: 'antimicrobial stewardship',
  medication_safety: 'medication safety',
  cardiovascular: 'cardiovascular pharmacotherapy',
  digital_decision_support: 'clinical decision support',
  pharmacy_practice_implementation: 'pharmacy practice',
  other: 'clinical pharmacy',
};

const CATEGORY_VARIANTS = {
  antimicrobial_stewardship: [
    (isStrong) =>
      isStrong
        ? 'Antimicrobial stewardship is the centre of my own clinical research, including a hospital trial on carbapenem de-escalation and microbiological concordance (Ali et al., 2022), so your paper is directly relevant to the direction I hope to take in a PhD.'
        : 'Antimicrobial stewardship is the centre of my own clinical research, including a hospital trial on carbapenem de-escalation and microbiological concordance (Ali et al., 2022), and I would value your perspective on prospective doctoral research in this field.',
    (isStrong) =>
      isStrong
        ? 'Having evaluated carbapenem de-escalation protocols and microbiological concordance in prospective hospital trials (Ali et al., 2022), I found your publication directly relevant to my research background in antimicrobial stewardship.'
        : 'Having evaluated carbapenem de-escalation protocols and microbiological concordance in prospective hospital trials (Ali et al., 2022), I would value your perspective on potential doctoral study in hospital pharmacy.',
    (isStrong) =>
      isStrong
        ? 'My hospital research includes clinical trials on carbapenem de-escalation and microbiological concordance (Ali et al., 2022), and your paper is directly relevant to my goal of advancing evidence-based antimicrobial stewardship during a PhD.'
        : 'My hospital research includes clinical trials on carbapenem de-escalation and microbiological concordance (Ali et al., 2022), and I would value your perspective on prospective PhD opportunities in clinical antimicrobial stewardship.',
  ],
  antibiotic_prescribing: [
    (isStrong) =>
      isStrong
        ? 'My hospital research focuses on antibiotic prescribing and carbapenem stewardship trials (Ali et al., 2022), so your publication is directly relevant to the clinical implementation questions I wish to investigate in a PhD.'
        : 'My hospital research focuses on antibiotic prescribing and carbapenem stewardship trials (Ali et al., 2022), and I would value your perspective on prospective PhD opportunities in this domain.',
    (isStrong) =>
      isStrong
        ? 'Having studied inpatient antibiotic usage patterns and microbiological concordance (Ali et al., 2022) across 17+ years in clinical pharmacy, your paper is directly relevant to my prospective PhD direction.'
        : 'Having studied inpatient antibiotic usage patterns and microbiological concordance (Ali et al., 2022) across 17+ years in clinical pharmacy, I would value your perspective on potential doctoral study.',
    (isStrong) =>
      isStrong
        ? 'Optimising antibiotic prescribing and antimicrobial stewardship is the central theme of my clinical trials (Ali et al., 2022), making your paper directly relevant to my doctoral research interests.'
        : 'Optimising antibiotic prescribing and antimicrobial stewardship is the central theme of my clinical trials (Ali et al., 2022), and I would value your perspective on doctoral study in hospital pharmacy.',
  ],
  medication_safety: [
    (isStrong) =>
      isStrong
        ? 'Inpatient medication safety and high-alert drug monitoring represent a primary pillar of my hospital research (Baig et al., 2025), so your paper is directly relevant to my doctoral research focus.'
        : 'Inpatient medication safety and high-alert drug monitoring represent a primary pillar of my hospital research (Baig et al., 2025), and I would value your perspective on potential PhD research in this area.',
    (isStrong) =>
      isStrong
        ? 'Having investigated high-alert medication administration monitoring in inpatient hospital units (Baig et al., 2025), I found your publication directly relevant to the medication safety questions I wish to pursue in a PhD.'
        : 'Having investigated high-alert medication administration monitoring in inpatient hospital units (Baig et al., 2025), I would value your perspective on prospective doctoral research in patient safety.',
    (isStrong) =>
      isStrong
        ? 'My clinical research includes prospective evaluation of inpatient medication safety and high-alert drug monitoring (Baig et al., 2025), making your paper directly relevant to my academic goals.'
        : 'My clinical research includes prospective evaluation of inpatient medication safety and high-alert drug monitoring (Baig et al., 2025), and I would value your perspective on doctoral study in medication safety.',
  ],
  cardiovascular: [
    (isStrong) =>
      isStrong
        ? 'My clinical research background includes comparative hospital pharmacotherapy trials evaluating calcium channel blockers versus beta-blockers (Abidi et al., 2024), so your publication is directly relevant to my proposed PhD focus.'
        : 'My clinical research background includes comparative hospital pharmacotherapy trials evaluating calcium channel blockers versus beta-blockers (Abidi et al., 2024), and I would value your perspective on potential PhD opportunities in cardiovascular care.',
    (isStrong) =>
      isStrong
        ? 'Having investigated cardiovascular pharmacotherapy regimens in clinical inpatient cohorts (Abidi et al., 2024), your paper is directly relevant to the cardiovascular pharmacotherapy topics I hope to investigate in a PhD.'
        : 'Having investigated cardiovascular pharmacotherapy regimens in clinical inpatient cohorts (Abidi et al., 2024), I would value your perspective on doctoral research in clinical pharmacotherapy.',
    (isStrong) =>
      isStrong
        ? 'Comparative cardiovascular pharmacotherapy outcomes form an active area of my hospital research (Abidi et al., 2024), making your work directly relevant to my doctoral research objectives.'
        : 'Comparative cardiovascular pharmacotherapy outcomes form an active area of my hospital research (Abidi et al., 2024), and I would value your perspective on potential doctoral study.',
  ],
  digital_decision_support: [
    (isStrong) =>
      isStrong
        ? 'My clinical practice and research focus on clinical decision support tools and technology implementation in hospital pharmacy, so your publication is directly relevant to the doctoral questions I hope to address.'
        : 'My clinical practice and research focus on clinical decision support tools and technology implementation in hospital pharmacy, and I would value your perspective on potential PhD research in digital pharmacy practice.',
    (isStrong) =>
      isStrong
        ? 'Bridging digital clinical decision support with hospital medication safety and stewardship is the focus of my research, making your publication directly relevant to my prospective PhD work.'
        : 'Bridging digital clinical decision support with hospital medication safety and stewardship is the focus of my research, and I would value your perspective on doctoral opportunities in this area.',
    (isStrong) =>
      isStrong
        ? 'Having worked to implement evidence-based pharmacy workflows and clinical decision support in hospital practice, your publication is directly relevant to my intended doctoral research.'
        : 'Having worked to implement evidence-based pharmacy workflows and clinical decision support in hospital practice, I would value your perspective on doctoral research in healthcare informatics.',
  ],
  pharmacy_practice_implementation: [
    (isStrong) =>
      isStrong
        ? 'With 17+ years of hospital pharmacy practice and an MPhil in Pharmacy Practice, your publication is directly relevant to my research on hospital implementation science and clinical pharmacy interventions.'
        : 'With 17+ years of hospital pharmacy practice and an MPhil in Pharmacy Practice, I would value your perspective on doctoral research opportunities in hospital implementation science.',
    (isStrong) =>
      isStrong
        ? 'My background in pharmacy practice and clinical trial implementation across inpatient services makes your publication directly relevant to the doctoral research I wish to undertake.'
        : 'My background in pharmacy practice and clinical trial implementation across inpatient services leads me to value your perspective on doctoral study in clinical pharmacy practice.',
    (isStrong) =>
      isStrong
        ? 'Hospital pharmacy practice and clinical service implementation are the focus of my career and MPhil research, so your paper is directly relevant to my prospective PhD plans.'
        : 'Hospital pharmacy practice and clinical service implementation are the focus of my career and MPhil research, and I would value your perspective on potential PhD opportunities.',
  ],
  other: [
    (isStrong) =>
      isStrong
        ? 'With 17+ years of clinical pharmacy practice at Liaquat National Hospital and an MPhil in Pharmacy Practice, your publication is directly relevant to my hospital pharmacy and health services research.'
        : 'With 17+ years of clinical pharmacy practice at Liaquat National Hospital and an MPhil in Pharmacy Practice, I would value your perspective on potential PhD research in hospital clinical pharmacy.',
    (isStrong) =>
      isStrong
        ? 'My clinical research encompasses antimicrobial stewardship (Ali et al., 2022) and medication safety (Baig et al., 2025), making your publication directly relevant to my doctoral pursuits.'
        : 'My clinical research encompasses antimicrobial stewardship (Ali et al., 2022) and medication safety (Baig et al., 2025), and I would value your perspective on prospective doctoral study.',
    (isStrong) =>
      isStrong
        ? 'As a hospital clinical pharmacist with experience in prospective clinical trials (Ali et al., 2022; Baig et al., 2025), I found your publication directly relevant to my academic interests.'
        : 'As a hospital clinical pharmacist with experience in prospective clinical trials (Ali et al., 2022; Baig et al., 2025), I would value your perspective on doctoral research in clinical pharmacy practice.',
  ],
};

// ─── Fixed Deterministic Template (Requirement 2) ─────────────────────────────
function getDeterministicTemplate(candidate, cleanPaperTitle, universityName) {
  const category = detectTopicCategory(candidate);
  const isStrong = (candidate.relevanceScore || 0) >= RELEVANCE_STRONG;
  const hashVal = Math.abs(stringHash(candidate.id || candidate.name || ''));
  const variantIdx = hashVal % 3;
  const categoryVariants = CATEGORY_VARIANTS[category] || CATEGORY_VARIANTS.other;
  const categorySentence = categoryVariants[variantIdx](isStrong);

  const catLabel = CATEGORY_LABELS[category] || 'clinical pharmacy';
  const subject = `PhD research enquiry – clinical pharmacy and ${catLabel} (Dr. Shama Abidi)`;

  const body = `I am writing to respectfully inquire about PhD research opportunities at ${universityName}. I recently read with interest your publication, "${cleanPaperTitle}".

${categorySentence} With over 17 years of clinical pharmacy practice at Liaquat National Hospital and an MPhil in Pharmacy Practice, my research includes prospective hospital trials on antimicrobial stewardship (evaluating carbapenem de-escalation and microbiological concordance [Ali et al., 2022]), medication safety [Baig et al., 2025], and cardiovascular pharmacotherapy [Abidi et al., 2024]. I would welcome the opportunity to discuss prospective PhD openings. My academic CV is attached for your review.

If this is not relevant to your work, just let me know and I will not write again.`;

  return {
    subject,
    body,
    generator: 'template',
    category,
  };
}

// ─── Output Validator (Requirement 2 & 4) ─────────────────────────────────────
function validateEmailDraft(emailText, candidate, fullSalutation, signature, subject = '') {
  const errors = [];
  const cleanPaperTitle = (candidate.paperTitle || candidate.recentWorkTitles?.[0] || '').trim().replace(/[.,;:\s]+$/, '');

  // 1. Signature untouched
  if (!emailText.endsWith(signature.trim())) {
    errors.push('Signature does not match constant SENDER_SIGNATURE or was modified.');
  }

  // 2. Salutation correct
  if (!emailText.startsWith(fullSalutation.trim())) {
    errors.push(`Salutation does not start with expected: "${fullSalutation.trim()}".`);
  }

  let bodyWithoutEnds = emailText;
  if (bodyWithoutEnds.startsWith(fullSalutation.trim())) {
    bodyWithoutEnds = bodyWithoutEnds.slice(fullSalutation.trim().length);
  }
  if (bodyWithoutEnds.endsWith(signature.trim())) {
    bodyWithoutEnds = bodyWithoutEnds.slice(0, -signature.trim().length);
  }
  bodyWithoutEnds = bodyWithoutEnds.trim();

  // 3. Opt-out sentence present
  const optOutText = 'If this is not relevant to your work, just let me know and I will not write again.';
  if (!bodyWithoutEnds.includes(optOutText)) {
    errors.push(`Missing required opt-out line: "${optOutText}".`);
  }

  // 4. Exact stored title present once
  if (cleanPaperTitle) {
    const escaped = cleanPaperTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = bodyWithoutEnds.match(new RegExp(escaped, 'gi')) || [];
    if (matches.length === 0) {
      errors.push(`Exact paper title "${cleanPaperTitle}" not found in email.`);
    } else if (matches.length > 1) {
      errors.push(`Exact paper title "${cleanPaperTitle}" appears more than once (${matches.length} times).`);
    }
  }

  // 5. Word count: 130 - 170 words total
  const totalWords = emailText.split(/\s+/).filter(Boolean).length;
  if (totalWords < 130 || totalWords > 170) {
    errors.push(`Total email word count (${totalWords}) is outside required 130-170 range.`);
  }

  // 6. Subject line checks (Requirement 2)
  if (subject) {
    if (subject.length > 90) {
      errors.push(`Subject line is too long (${subject.length} chars > 90 max).`);
    }
    if (/\b(in|for|of|and|the|a|an|to|with|at|on|cr|tr|res|clin)\s*$/i.test(subject) || /[a-zA-Z]–\s*$/.test(subject)) {
      errors.push('Subject line ends mid-word or with an incomplete preposition.');
    }
  }

  // 7. Check if body contains any 4+ word substring of the title other than the full quoted title (Requirement 2)
  if (cleanPaperTitle && cleanPaperTitle.length > 15) {
    const titleWords = cleanPaperTitle.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (titleWords.length >= 4) {
      const escaped = cleanPaperTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const quoteRegex = new RegExp(`["']\\s*${escaped}[,.]?\\s*["']`, 'gi');
      const bodyWithoutTitle = bodyWithoutEnds.replace(quoteRegex, ' ');
      const bodyNorm = bodyWithoutTitle.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');

      for (let i = 0; i <= titleWords.length - 4; i++) {
        const fourWords = titleWords.slice(i, i + 4).join(' ');
        if (bodyNorm.includes(` ${fourWords} `)) {
          errors.push(`Body contains unauthorized 4+ word title substring fragment: "${fourWords}".`);
          break;
        }
      }
    }
  }

  // 8. Sentence ending check: check that sentences don't end mid-word or with cut-off prepositions (Requirement 2)
  const sentences = bodyWithoutEnds.split(/[.!?]\s+/);
  for (const s of sentences) {
    const trimmed = s.trim();
    if (trimmed && /\b(in|for|of|and|the|a|an|to|with|at|on|cr|tr|res|clin)$/i.test(trimmed)) {
      errors.push(`Sentence ends with an incomplete or cut-off word: "...${trimmed.slice(-25)}"`);
      break;
    }
  }

  // 9. Number verification: every number/percentage in email must be in abstract or SHAMA_PROFILE
  const allowedNumbers = new Set(['17', '2022', '2024', '2025', String(candidate.year || '')]);
  const sourceContent = `${candidate.abstract || ''} ${candidate.paperTitle || ''}`;
  const foundSourceNums = sourceContent.match(/\b\d+(\.\d+)?%?\b/g) || [];
  for (const n of foundSourceNums) {
    allowedNumbers.add(n);
    allowedNumbers.add(n.replace('%', ''));
  }

  const emailNumbers = bodyWithoutEnds.match(/\b\d+(\.\d+)?%?\b/g) || [];
  for (const num of emailNumbers) {
    const cleanNum = num.replace('%', '');
    if (!allowedNumbers.has(num) && !allowedNumbers.has(cleanNum)) {
      errors.push(`Unverified number "${num}" found in email that does not appear in abstract or SHAMA_PROFILE.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    totalWords,
  };
}

// ─── Pacing & AI Error Tracking (Requirement 1 & Part D) ───────────────────────
let lastAiCallTimestamp = 0;
const aiErrorLog = [];
let hasLoggedGeminiSkipped = false;

async function paceAiCall() {
  const elapsed = (Date.now() - lastAiCallTimestamp) / 1000;
  if (elapsed < GENERATION_GAP_SEC) {
    const waitMs = Math.ceil((GENERATION_GAP_SEC - elapsed) * 1000);
    await sleep(waitMs);
  }
  lastAiCallTimestamp = Date.now();
}

function logAiError(entry) {
  aiErrorLog.push({
    timestamp: new Date().toISOString(),
    candidateName: entry.candidateName || 'Unknown',
    model: entry.model || 'Unknown',
    statusCode: entry.statusCode || 'N/A',
    errorBody: String(entry.errorBody || entry.error || '').slice(0, 150),
  });
}

// ─── AI Email Generator with Sequential Pacing & 4-Tier Fallback Chain ─────────
async function generateOutreachEmail(candidate, errorFeedback = null) {
  const surname = candidate.ownerSurname || parseAuthorSurname(candidate.name);
  const cleanPaperTitle = (candidate.paperTitle || candidate.recentWorkTitles?.[0] || 'Clinical Healthcare Research')
    .trim()
    .replace(/[.,;:\s]+$/, '');
  const universityName = candidate.institution || 'your university';
  const storedAbstract = candidate.abstract || 'Clinical pharmacy practice and medication safety research.';
  const category = detectTopicCategory(candidate);
  const catLabel = CATEGORY_LABELS[category] || 'clinical pharmacy';
  const fixedSubject = `PhD research enquiry – clinical pharmacy and ${catLabel} (Dr. Shama Abidi)`;

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
- Abstract: "${storedAbstract.slice(0, 1200)}"

CRITICAL PROMPT RULES:
1. Quote the exact stored paper title once: "${cleanPaperTitle}" in quotes. Use this exact title; do not invent titles, journals or facts. Never alter or truncate it. Never use fragments of the title elsewhere in the email.
2. Include exactly ONE concrete sentence that refers to a specific element of THIS paper's abstract (setting, method, population or finding) and links it to a matching real trial from Dr. Shama's profile.
3. No invented numbers, percentages, dates, results, journals, or claims. Every number used MUST appear in the abstract or in Dr. Shama's profile above.
4. Keep the body length strictly around 115-125 words (so total email including greeting and signature is 140-160 words).
5. Polite, specific, academic tone. No flattery clichés.
6. End with this exact opt-out sentence:
"If this is not relevant to your work, just let me know and I will not write again."
7. Output ONLY in this format:
SUBJECT: ${fixedSubject}
BODY:
[Body text paragraphs only, WITHOUT salutation or sign-off/signature]
${errorFeedback ? `\nPREVIOUS GENERATION FAILED VALIDATION: ${errorFeedback}. Please fix this strictly.` : ''}`;

  // ─── TIER 1: Groq Model 1 (openai/gpt-oss-120b) ─────────────────────────────
  const groqKey = process.env.GROQ_API_KEY;
  const model1 = (process.env.GROQ_MODEL || 'openai/gpt-oss-120b').trim();
  if (groqKey) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await paceAiCall();
        const groq = new Groq({ apiKey: groqKey });
        const comp = await Promise.race([
          groq.chat.completions.create({
            model: model1,
            reasoning_effort: 'low',
            messages: [
              { role: 'system', content: promptSystem },
              { role: 'user', content: `Please compose the inquiry email body for Dr./Professor ${surname}.` },
            ],
            temperature: 0.3,
            max_tokens: 2500,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Groq ${model1} timeout 30s`)), 30000)),
        ]);

        let text = comp.choices[0]?.message?.content || '';
        if (!text || !text.trim()) {
          if (attempt === 1) {
            console.warn(`   ⚠️ Groq ${model1} returned empty content on attempt 1. Retrying once...`);
            continue;
          }
          throw new Error(`Groq ${model1} returned empty content (finish_reason: ${comp.choices[0]?.finish_reason})`);
        }

        const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i);
        let body = (bodyMatch ? bodyMatch[1] : text).trim();
        body = body.replace(/^Dear\s+[^,\n]+,\s*/i, '').trim();
        body = body.replace(/(Sincerely|Kind regards|Best regards|Warm regards|Regards|Dr\.?\s*Shama\s*Abidi|Shama\s*Abidi)[\s\S]*$/i, '').trim();

        if (body && body.length > 50) {
          if (!body.includes('If this is not relevant to your work')) {
            body += '\n\nIf this is not relevant to your work, just let me know and I will not write again.';
          }
          return {
            subject: fixedSubject,
            body,
            generator: `groq/${model1}`,
            category,
          };
        }
      } catch (err) {
        logAiError({ candidateName: candidate.name, model: model1, statusCode: err.status || 500, errorBody: err.message });
        console.warn(`   ⚠️ Groq [${model1}] failed (${err.status || err.message}). Trying Tier 2 fallback...`);
        if (err.status === 429) await sleep(5000);
        break; // break retry loop to fall to Tier 2
      }
    }
  }

  // ─── TIER 2: Groq Model 2 (qwen/qwen3.8-27b) ────────────────────────────────
  const model2 = (process.env.GROQ_MODEL_2 || 'qwen/qwen3.8-27b').trim();
  if (groqKey && model2) {
    try {
      await paceAiCall();
      const groq = new Groq({ apiKey: groqKey });
      const comp = await Promise.race([
        groq.chat.completions.create({
          model: model2,
          messages: [
            { role: 'system', content: promptSystem },
            { role: 'user', content: `Please compose the inquiry email body for Dr./Professor ${surname}.` },
          ],
          temperature: 0.3,
          max_tokens: 600,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Groq ${model2} timeout 15s`)), 15000)),
      ]);

      const text = comp.choices[0]?.message?.content || '';
      if (!text) {
        throw new Error(`Groq ${model2} returned empty content`);
      }
      const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i);
      let body = (bodyMatch ? bodyMatch[1] : text).trim();
      body = body.replace(/^Dear\s+[^,\n]+,\s*/i, '').trim();
      body = body.replace(/(Sincerely|Kind regards|Best regards|Warm regards|Regards|Dr\.?\s*Shama\s*Abidi|Shama\s*Abidi)[\s\S]*$/i, '').trim();

      if (body && body.length > 50) {
        if (!body.includes('If this is not relevant to your work')) {
          body += '\n\nIf this is not relevant to your work, just let me know and I will not write again.';
        }
        return {
          subject: fixedSubject,
          body,
          generator: `groq/${model2}`,
          category,
        };
      }
    } catch (err) {
      logAiError({ candidateName: candidate.name, model: model2, statusCode: err.status || 500, errorBody: err.message });
      console.warn(`   ⚠️ Groq [${model2}] failed (${err.status || err.message}). Trying Tier 3 fallback...`);
      if (err.status === 429) await sleep(5000);
    }
  }

  // ─── TIER 3: Gemini (gemini-2.5-flash -> gemini-3.8-flash) ───────────────────
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    if (!hasLoggedGeminiSkipped) {
      console.log('   ℹ️ Gemini skipped (no key)');
      hasLoggedGeminiSkipped = true;
    }
  } else {
    const geminiModelsToTry = ['gemini-2.5-flash', 'gemini-3.8-flash'];
    for (const gModel of geminiModelsToTry) {
      try {
        await paceAiCall();
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: gModel });
        const geminiPrompt = `${promptSystem}\n\nPlease compose the inquiry email body for Dr./Professor ${surname}.`;

        const result = await Promise.race([
          model.generateContent(geminiPrompt),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Gemini ${gModel} timeout 15s`)), 15000)),
        ]);

        const text = result.response.text();
        const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i);
        let body = (bodyMatch ? bodyMatch[1] : text).trim();
        body = body.replace(/^Dear\s+[^,\n]+,\s*/i, '').trim();
        body = body.replace(/(Sincerely|Kind regards|Best regards|Warm regards|Regards|Dr\.?\s*Shama\s*Abidi|Shama\s*Abidi)[\s\S]*$/i, '').trim();

        if (body && body.length > 50) {
          if (!body.includes('If this is not relevant to your work')) {
            body += '\n\nIf this is not relevant to your work, just let me know and I will not write again.';
          }
          return {
            subject: fixedSubject,
            body,
            generator: `gemini/${gModel}`,
            category,
          };
        }
      } catch (err) {
        let statusCode = err.status;
        if (!statusCode && err.message) {
          const match = err.message.match(/\[(\d{3})\s/);
          if (match) statusCode = parseInt(match[1], 10);
        }
        if (!statusCode) statusCode = 500;
        logAiError({ candidateName: candidate.name, model: gModel, statusCode, errorBody: err.message });
        console.warn(`   ⚠️ Gemini [${gModel}] failed (${statusCode}): ${err.message}.`);
        if (statusCode === 429) await sleep(5000);
      }
    }
  }

  // ─── TIER 4: Deterministic Template Fallback ─────────────────────────────────
  return getDeterministicTemplate(candidate, cleanPaperTitle, universityName);
}

// ─── IMAP Client & Drafts Folder Detection ────────────────────────────────────
let sharedImapClient = null;
let cachedDraftsFolder = null;

async function getImapClient() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;

  if (sharedImapClient && sharedImapClient.usable) {
    return sharedImapClient;
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  await client.connect();
  sharedImapClient = client;

  if (!cachedDraftsFolder) {
    try {
      const list = await client.list();
      const draftsBox = list.find((b) => b.specialUse === '\\Drafts');
      cachedDraftsFolder = draftsBox?.path || '[Gmail]/Drafts';
    } catch {
      cachedDraftsFolder = '[Gmail]/Drafts';
    }
  }

  return sharedImapClient;
}

async function closeImapClient() {
  if (sharedImapClient) {
    try {
      await sharedImapClient.logout();
    } catch {
      // ignore
    }
    sharedImapClient = null;
  }
}

async function appendDraftWithRetry(toEmail, subject, fullBody, candidateId) {
  const user = process.env.GMAIL_USER;
  if (!user || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('Gmail credentials (GMAIL_USER or GMAIL_APP_PASSWORD) not configured');
  }

  const cvAttachment = getCvAttachment();
  const compiler = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const info = await compiler.sendMail({
    from: `"Dr. Shama Abidi" <${user}>`,
    to: toEmail,
    subject: subject.replace(/[\r\n]+/g, ' ').trim(),
    text: fullBody,
    headers: {
      'X-PhDReach-Candidate': String(candidateId || 'unknown'),
    },
    attachments: cvAttachment ? [cvAttachment] : [],
  });

  const messageBuffer = info.message;
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const client = await getImapClient();
      if (!client) throw new Error('Could not establish IMAP connection');

      const folder = cachedDraftsFolder || '[Gmail]/Drafts';
      await client.append(folder, messageBuffer, ['\\Draft', '\\Seen']);
      return true;
    } catch (err) {
      lastError = err;
      console.warn(`   ⚠️ IMAP append attempt ${attempt}/3 failed:`, err.message);
      await closeImapClient();
      if (attempt < 3) {
        await sleep(1000 * attempt);
      }
    }
  }

  throw lastError || new Error('IMAP append failed after 3 attempts');
}

// ─── Seniority & Relevance Ranking ───────────────────────────────────────────
function scoreCandidateForDrafting(cand, bouncedDomains = {}) {
  let score = cand.relevanceScore || 30;

  // Seniority bonus
  const works = cand.worksCount || 0;
  const hIndex = cand.hIndex || 0;
  if (works >= 50 || hIndex >= 15) score += 20;
  else if (works >= 20 || hIndex >= 8) score += 10;
  else if (works >= 5) score += 5;

  // Role bonus
  if (cand.authorRole === 'corresponding_senior_author') score += 25;
  else if (cand.authorRole === 'last_author' || cand.authorRole === 'corresponding_author') score += 15;
  else if (cand.authorRole === 'first_author_prolific') score += 10;

  // Personal email rank: rank below institutional emails
  if (cand.emailConfidence === 'personal-from-paper') {
    score -= 50;
  } else if (cand.emailConfidence?.startsWith('personal')) {
    score -= 25;
  }

  // Domain bounce penalty
  const domain = extractDomain(cand.email);
  if (domain && bouncedDomains[domain.replace(/\./g, '_')]) {
    score -= 25 * bouncedDomains[domain.replace(/\./g, '_')];
  }

  return score;
}

// ─── Stage 4 Draft Runner ─────────────────────────────────────────────────────
async function runStage4Draft(options = {}) {
  const dailyTarget = options.limit || DAILY_TARGET;
  const isDryRun = Boolean(options.dryRun);
  const budgetMin = options.budgetMin || DRAFT_BUDGET_MIN;
  const stageStartTime = Date.now();
  const stageBudgetMs = budgetMin * 60 * 1000;

  console.log(`\n================================================================`);
  console.log(`✉️ STAGE 4: GENERATE AI EMAILS & SYNC GMAIL DRAFTS`);
  console.log(`   Daily Target: ${dailyTarget} | Time Budget: ${budgetMin}m | Dry Run: ${isDryRun}`);
  console.log(`================================================================`);

  // Auto-release any stale claimed docs older than 1 hour
  if (!isDryRun) {
    await autoReleaseStaleClaims();
  }

  // Load bouncedDomains state to prioritize healthy domains
  let bouncedDomains = {};
  try {
    const bSnap = await db.collection('state').doc('bouncedDomains').get();
    if (bSnap.exists) bouncedDomains = bSnap.data() || {};
  } catch {
    // Non-fatal
  }

  let snapshot;
  try {
    if (options.candidates && options.candidates.length > 0) {
      snapshot = {
        docs: options.candidates.map((c) => ({
          id: c.id,
          ref: c.ref || null,
          data: () => c,
        })),
        size: options.candidates.length,
        empty: options.candidates.length === 0,
      };
    } else {
      snapshot = await db
        .collection('candidates')
        .where('status', '==', 'verified')
        .limit(dailyTarget * 4)
        .get();
    }
  } catch (err) {
    console.error('   ❌ [Stage 4] Failed to fetch verified candidates:', err.message);
    return { drafted: 0, skipped_dup: 0, failed: 0, errors: [err.message] };
  }

  if (!snapshot.docs || snapshot.docs.length === 0) {
    console.log('   ℹ️ No candidates pending drafting (status=verified).');
    return { drafted: 0, skipped_dup: 0, failed: 0, errors: [] };
  }

  // Rank by combined relevance score + seniority bonus
  const allVerified = snapshot.docs
    .map((d) => ({
      id: d.id,
      ref: d.ref,
      ...d.data(),
      draftScore: scoreCandidateForDrafting(d.data(), bouncedDomains),
    }))
    .sort((a, b) => b.draftScore - a.draftScore);

  console.log(`   Found ${allVerified.length} verified candidates available for drafting.\n`);

  let draftedCount = 0;
  let skippedDup = 0;
  let failedCount = 0;
  const errors = [];
  const generatorCounts = { groq: 0, gemini: 0, template: 0 };
  const institutionDraftCounts = new Map();
  const draftedSamples = [];
  const seenEmailsInRun = new Set();
  const seenNameInstInRun = new Set();
  const maxPersonalDrafts = Math.max(1, Math.floor(dailyTarget * (PERSONAL_MAX_SHARE || 0.2)));
  let personalDraftsCount = 0;

  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  for (const cand of allVerified) {
    if (draftedCount >= dailyTarget) break;
    if (Date.now() - stageStartTime >= stageBudgetMs) {
      console.log(`⏱️ [Stage 4] Time budget of ${budgetMin}m reached. Stopping cleanly.`);
      break;
    }

    const normEmail = (cand.email || '').toLowerCase().trim();
    if (!normEmail) continue;

    const emailHash = sha1(normEmail);
    const nameInstKey = sha1(`${normalizeKey(cand.name)}__${normalizeKey(cand.institution)}`);
    const profRef = db.collection('professors').doc(emailHash);
    const nameInstRef = db.collection('seen_professors').doc(`nameinst_${nameInstKey}`);

    // In-run deduplication check: zero duplicate drafts for same email or name+institution
    if (seenEmailsInRun.has(emailHash) || seenNameInstInRun.has(nameInstKey)) {
      console.log(`   ⏭️ [Stage 4 Duplicate In-Run] "${cand.name}" <${normEmail}> already drafted in this run.`);
      skippedDup++;
      continue;
    }

    // Personal email cap check: at most PERSONAL_MAX_SHARE (default 20%) of daily drafts
    const isPersonal = cand.emailConfidence?.startsWith('personal');
    if (isPersonal && personalDraftsCount >= maxPersonalDrafts) {
      console.log(`   ⏭️ [Stage 4 Personal Cap Reached] Personal email draft cap (${personalDraftsCount}/${maxPersonalDrafts}) reached. Skipping "${cand.name}".`);
      continue;
    }

    // Institution cap: max 3 drafts per institution per day
    const instKey = (cand.institution || 'unknown').toLowerCase().trim();
    const instCurrentCount = institutionDraftCounts.get(instKey) || 0;
    if (instCurrentCount >= 3) {
      console.log(`   ⏭️ [Stage 4 Institution Cap Reached] "${cand.institution}" already has 3 drafts today. Skipping candidate "${cand.name}".`);
      continue;
    }

    console.log(`   [${draftedCount + 1}/${dailyTarget}] Processing outreach to: ${cand.name} (${cand.institution}) <${normEmail}>...`);

    // 1. 365-day Deduplication Check
    try {
      const existingProf = await profRef.get();
      if (existingProf.exists) {
        const pData = existingProf.data() || {};
        const draftedDate = pData.draftedAt?.toDate ? pData.draftedAt.toDate() : new Date(pData.draftedAt || pData.createdAt || 0);
        if (pData.status === 'drafted' && draftedDate >= oneYearAgo) {
          console.log(`   ⏭️ [Stage 4 Duplicate Skipped] "${cand.name}" <${normEmail}> | Reason: Email already drafted within 365 days`);
          skippedDup++;
          if (!isDryRun) {
            await cand.ref.update({ status: 'drafted', updatedAt: FieldValue.serverTimestamp() }).catch(() => {});
          }
          continue;
        }
      }
    } catch (profErr) {
      console.warn(`   ⚠️ Error checking existing professor:`, profErr.message);
    }

    try {
      const existingSeen = await nameInstRef.get();
      if (existingSeen.exists) {
        const sData = existingSeen.data() || {};
        const draftedDate = sData.draftedAt?.toDate ? sData.draftedAt.toDate() : new Date(sData.draftedAt || sData.createdAt || 0);
        if (sData.status === 'drafted' && draftedDate >= oneYearAgo) {
          console.log(`   ⏭️ [Stage 4 Duplicate Skipped] "${cand.name}" (${cand.institution}) | Reason: Name+Institution drafted within 365 days`);
          skippedDup++;
          if (!isDryRun) {
            await cand.ref.update({ status: 'drafted', updatedAt: FieldValue.serverTimestamp() }).catch(() => {});
          }
          continue;
        }
      }
    } catch (seenErr) {
      console.warn(`   ⚠️ Error checking seen_professors:`, seenErr.message);
    }

    // 2. Atomic Claim (Live mode only - NEVER write in dry run)
    if (!isDryRun) {
      try {
        await profRef.create({
          email: normEmail,
          name: cand.name,
          institution: cand.institution,
          university: cand.institution,
          status: 'claimed',
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (claimErr) {
        if (claimErr.code === 6 || claimErr.message?.includes('ALREADY_EXISTS')) {
          console.log(`   ⏭️ [Stage 4 Duplicate Skipped] "${cand.name}" <${normEmail}> | Reason: Race claim exists`);
          skippedDup++;
          await cand.ref.update({ status: 'drafted', updatedAt: FieldValue.serverTimestamp() }).catch(() => {});
          continue;
        }
        console.warn(`      ⚠️ Atomic claim error for ${cand.name}:`, claimErr.message);
        failedCount++;
        errors.push({ name: cand.name, error: claimErr.message });
        continue;
      }

      try {
        await nameInstRef.create({
          name: cand.name,
          institution: cand.institution,
          email: normEmail,
          status: 'claimed',
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (nameInstErr) {
        if (nameInstErr.code === 6 || nameInstErr.message?.includes('ALREADY_EXISTS')) {
          skippedDup++;
          await profRef.delete().catch(() => {});
          await cand.ref.update({ status: 'drafted', updatedAt: FieldValue.serverTimestamp() }).catch(() => {});
          continue;
        }
      }
    }

    // 3. Generate AI Outreach Email with Strict Validation & 1 Retry
    const salutation = parseAuthorSalutation(cand);
    let emailContent;
    let validatorResult;
    let fullBody;

    try {
      emailContent = await generateOutreachEmail(cand);
      fullBody = `${salutation}\n\n${emailContent.body}\n\n${SENDER_SIGNATURE}`;
      validatorResult = validateEmailDraft(fullBody, cand, salutation, SENDER_SIGNATURE);

      // If validation failed, regenerate ONCE with error feedback
      if (!validatorResult.valid) {
        console.warn(`      ⚠️ Email draft validation failed: ${validatorResult.errors.join('; ')}. Regenerating once...`);
        const feedback = validatorResult.errors.join('; ');
        emailContent = await generateOutreachEmail(cand, feedback);
        fullBody = `${salutation}\n\n${emailContent.body}\n\n${SENDER_SIGNATURE}`;
        validatorResult = validateEmailDraft(fullBody, cand, salutation, SENDER_SIGNATURE);

        // If still invalid, fall back to deterministic template
        if (!validatorResult.valid) {
          console.warn(`      ⚠️ Second validation failed. Falling back to deterministic template.`);
          emailContent = getDeterministicTemplate(
            cand,
            (cand.paperTitle || cand.recentWorkTitles?.[0] || 'Clinical Healthcare Research').trim().replace(/[.,;:\s]+$/, ''),
            cand.institution || 'your university'
          );
          fullBody = `${salutation}\n\n${emailContent.body}\n\n${SENDER_SIGNATURE}`;
          validatorResult = validateEmailDraft(fullBody, cand, salutation, SENDER_SIGNATURE);
        }
      }
    } catch (genErr) {
      console.warn(`      ⚠️ AI generation exception:`, genErr.message);
      emailContent = getDeterministicTemplate(
        cand,
        (cand.paperTitle || cand.recentWorkTitles?.[0] || 'Clinical Healthcare Research').trim().replace(/[.,;:\s]+$/, ''),
        cand.institution || 'your university'
      );
      fullBody = `${salutation}\n\n${emailContent.body}\n\n${SENDER_SIGNATURE}`;
      validatorResult = validateEmailDraft(fullBody, cand, salutation, SENDER_SIGNATURE);
    }

    // Record generator used
    const genKey = emailContent.generator.includes('groq') ? 'groq' : (emailContent.generator.includes('gemini') ? 'gemini' : 'template');
    generatorCounts[genKey] = (generatorCounts[genKey] || 0) + 1;

    // 4. IMAP Draft Sync & DB Updates
    if (isDryRun) {
      draftedCount++;
      institutionDraftCounts.set(instKey, instCurrentCount + 1);
      seenEmailsInRun.add(emailHash);
      seenNameInstInRun.add(nameInstKey);
      if (isPersonal) personalDraftsCount++;

      console.log(`\n================================================================`);
      console.log(`📧 EMAIL DRAFT PREVIEW #${draftedCount} (DRY-RUN)`);
      console.log(`To: ${cand.name} <${normEmail}>`);
      console.log(`Institution: ${cand.institution} | Score: ${cand.draftScore} | Generator: ${emailContent.generator}`);
      console.log(`Header: X-PhDReach-Candidate: ${cand.id}`);
      console.log(`Validator: ${validatorResult.valid ? 'PASSED (130-170 words, verified numbers)' : `FAILED: ${validatorResult.errors.join(', ')}`}`);
      console.log(`Attachment: Dr_Shama_Abidi_Academic_CV.pdf (Zero external writes)`);
      console.log(`----------------------------------------------------------------`);
      console.log(`SUBJECT: ${emailContent.subject}\n`);
      console.log(`BODY:`);
      console.log(fullBody);
      console.log(`================================================================\n`);

      draftedSamples.push({
        to: `${cand.name} <${normEmail}>`,
        salutation,
        generatorUsed: emailContent.generator,
        institution: cand.institution,
        subject: emailContent.subject,
        body: fullBody,
        paperTitle: cand.paperTitle,
        validatorResult,
      });
    } else {
      let synced = false;
      try {
        synced = await appendDraftWithRetry(normEmail, emailContent.subject, fullBody, cand.id);
        console.log(`      📥 Draft synced to Gmail Drafts folder via IMAP (${emailContent.generator})`);
      } catch (imapErr) {
        console.warn(`      ❌ IMAP sync failed:`, imapErr.message);
        await profRef.delete().catch(() => {});
        await nameInstRef.delete().catch(() => {});
        failedCount++;
        errors.push({ name: cand.name, error: imapErr.message });
        continue;
      }

      try {
        await profRef.set(
          {
            name: cand.name,
            institution: cand.institution,
            university: cand.institution,
            country: cand.country || 'International',
            email: normEmail,
            emailSource: cand.emailSource,
            emailConfidence: cand.emailConfidence,
            verificationLevel: cand.emailConfidence || 'verified',
            recentPaper: cand.paperTitle || cand.recentWorkTitles?.[0] || '',
            researchArea: cand.topics?.[0] || '',
            relevanceScore: cand.relevanceScore,
            status: 'drafted',
            draftedAt: FieldValue.serverTimestamp(),
            emailSubject: emailContent.subject,
            emailBody: fullBody,
            generatorUsed: emailContent.generator,
            gmailSynced: Boolean(synced),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        await db.collection('emails').add({
          professorId: profRef.id,
          candidateId: cand.id,
          type: 'first',
          subject: emailContent.subject,
          body: fullBody,
          status: 'draft',
          generatorUsed: emailContent.generator,
          sentAt: null,
          createdAt: FieldValue.serverTimestamp(),
        });

        await nameInstRef.set(
          {
            status: 'drafted',
            draftedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        await cand.ref.update({
          status: 'drafted',
          generatorUsed: emailContent.generator,
          draftedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (dbErr) {
        console.warn(`      ⚠️ Failed to finalize drafted status in database:`, dbErr.message);
      }

      draftedCount++;
      institutionDraftCounts.set(instKey, instCurrentCount + 1);
      seenEmailsInRun.add(emailHash);
      seenNameInstInRun.add(nameInstKey);
      if (isPersonal) personalDraftsCount++;
      console.log(`      🎉 Successfully drafted! [${draftedCount}/${dailyTarget}]`);

      draftedSamples.push({
        to: `${cand.name} <${normEmail}>`,
        salutation,
        generatorUsed: emailContent.generator,
        institution: cand.institution,
        subject: emailContent.subject,
        body: fullBody,
        paperTitle: cand.paperTitle,
        validatorResult,
      });
    }

    await sleep(150);
  }

  if (!isDryRun) {
    await closeImapClient();
  }

  // Template usage check: warning if > 20%
  const totalGenerations = generatorCounts.groq + generatorCounts.gemini + generatorCounts.template;
  const templatePercent = totalGenerations > 0 ? (generatorCounts.template / totalGenerations) * 100 : 0;

  console.log(`\n📋 STAGE 4 SUMMARY:`);
  console.log(`   - Drafted: ${draftedCount}`);
  console.log(`   - Skipped Duplicates (365d): ${skippedDup}`);
  console.log(`   - Failed: ${failedCount}`);
  console.log(`   - Generators Used: Groq: ${generatorCounts.groq} | Gemini: ${generatorCounts.gemini} | Template: ${generatorCounts.template} (${templatePercent.toFixed(1)}%)`);

  if (templatePercent > 20) {
    console.warn(`   ⚠️ WARNING: Template fallback used for ${templatePercent.toFixed(1)}% of drafts (> 20%). Check Groq/Gemini API keys or rate limits.`);
    if (aiErrorLog.length > 0) {
      console.log(`\n   🤖 Model Failures during run:`);
      console.table(aiErrorLog.map((e) => ({
        Model: e.model,
        Candidate: (e.candidateName || '').slice(0, 20),
        Status: e.statusCode,
        Error: (e.errorBody || '').slice(0, 60),
      })));
    }
  }

  return {
    drafted: draftedCount,
    skipped_dup: skippedDup,
    failed: failedCount,
    generator_counts: generatorCounts,
    template_percent: templatePercent,
    drafted_samples: draftedSamples,
    ai_errors: [...aiErrorLog],
    errors,
  };
}

module.exports = {
  runStage4Draft,
  generateOutreachEmail,
  appendDraftWithRetry,
  validateEmailDraft,
  parseAuthorSurname,
  parseAuthorSalutation,
  scoreCandidateForDrafting,
  autoReleaseStaleClaims,
};
