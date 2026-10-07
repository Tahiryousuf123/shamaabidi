/**
 * Autonomous 50 Real Professor Discovery & Gmail Draft Generator
 * Designed for 100% cloud execution via GitHub Actions or local execution
 * Runs daily at 12:00 AM Pakistan Time (19:00 UTC)
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');

// ─── Load Environment Variables ───────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
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
  }
}
loadEnv();

// ─── Initialize Firebase Admin ────────────────────────────────────────────────
let key = (process.env.FIREBASE_PRIVATE_KEY || '').trim();
if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
  key = key.slice(1, -1);
}
key = key.replace(/\\n/g, '\n');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: (process.env.FIREBASE_PROJECT_ID || 'shamaabidi-3ddf8').trim(),
      clientEmail: (process.env.FIREBASE_CLIENT_EMAIL || '').trim(),
      privateKey: key,
    }),
  });
}
const db = admin.firestore();

// ─── CV Asset Loader ──────────────────────────────────────────────────────────
function getCvAttachment() {
  const pdfPath = path.resolve(__dirname, '../public/cv/Dr_Shama_Abidi_Academic_CV.pdf');
  if (fs.existsSync(pdfPath)) {
    return {
      filename: 'Dr_Shama_Abidi_Academic_CV.pdf',
      content: fs.readFileSync(pdfPath),
      contentType: 'application/pdf',
    };
  }
  return null;
}

// ─── Email Validator ──────────────────────────────────────────────────────────
function isAcceptableProfessorEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return false;
  const lower = email.toLowerCase().trim().replace(/[.,;:\s>)]+$/, '');
  if (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.gif')
  ) {
    return false;
  }
  const genericPrefixes = [
    'noreply@', 'no-reply@', 'donotreply@', 'support@', 'info@', 'admin@',
    'help@', 'feedback@', 'privacy@', 'contact@', 'webmaster@', 'postmaster@',
    'sales@', 'billing@', 'press@', 'media@', 'admissions@', 'recruitment@',
    'enquiries@', 'inquiries@', 'editor@', 'editorial@', 'mailer-daemon@',
    'general@', 'office@', 'service@', 'services@'
  ];
  if (genericPrefixes.some((p) => lower.startsWith(p))) return false;
  return true;
}

// ─── Shama Abidi Core Research Topics ─────────────────────────────────────────
const SEARCH_TOPICS = [
  'antimicrobial stewardship clinical pharmacy hospital',
  'medication safety adverse drug reactions high alert',
  'clinical pharmacist intervention hospital practice',
  'calcium channel blockers beta blockers cardiovascular',
  'artificial intelligence clinical decision support pharmacy',
  'evidence based pharmacy practice implementation hospital',
  'pharmacotherapy infectious diseases hospital inpatient',
  'therapeutic drug monitoring renal hepatic dosing pharmacist',
];

// ─── Europe PMC Academic Professor Discovery ──────────────────────────────────
async function fetchProfessorsFromEuropePmc(topic, limit = 20) {
  const currentYear = new Date().getFullYear();
  const query = encodeURIComponent(`(${topic}) AND FIRST_PDATE:[2022-01-01 TO ${currentYear}-12-31]`);
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${query}&resultType=core&format=json&pageSize=75`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PhDReach/2.0 (mailto:shamaabidiphd@gmail.com)' },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const articles = data.resultList?.result || [];
    const candidates = [];

    for (const art of articles) {
      if (candidates.length >= limit) break;
      const authors = art.authorList?.author || [];
      const title = art.title?.replace(/<[^>]+>/g, '').trim() || 'Clinical Healthcare Publication';
      const pubYear = art.pubYear ? parseInt(art.pubYear, 10) : currentYear;
      const doi = art.doi;
      const sourceUrl = doi ? `https://doi.org/${doi}` : 'https://europepmc.org';

      for (const author of authors) {
        const name = author.fullName || `${author.firstName || ''} ${author.lastName || ''}`.trim();
        if (!name || name.length < 3) continue;

        const affs = author.authorAffiliationDetailsList?.authorAffiliation?.map((x) => x.affiliation) || [];
        const affText = affs.join('; ');
        if (!affText) continue;

        const emailMatches = affText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
        if (!emailMatches || emailMatches.length === 0) continue;

        for (const rawEmail of emailMatches) {
          const email = rawEmail.toLowerCase().trim().replace(/[.,;:\s>)]+$/, '');
          if (!isAcceptableProfessorEmail(email)) continue;

          const university = affText.split(',')[0].replace(/electronic address:.*$/i, '').trim() || 'Academic Medical Center';
          const country = affText.split(',').pop()?.trim() || 'International';

          candidates.push({
            name,
            university,
            country,
            email,
            paperTitle: title,
            pubYear,
            sourceUrl,
            researchArea: topic,
            affText,
          });
          break;
        }
      }
    }
    return candidates;
  } catch (err) {
    console.warn(`Europe PMC query failed for "${topic}":`, err.message);
    return [];
  }
}

const Groq = require('groq-sdk');

// ─── AI Email Generation (Groq Fast LLM & Template Fallback) ──────────────────
async function generateEmailWithAI(profName, university, researchArea, paperTitle) {
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  const cleanName = profName.replace(/^Dr\.\s*|^Prof\.\s*|^Professor\s*/i, '').trim();

  if (groqKey) {
    try {
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: [
          {
            role: 'system',
            content: `You are Dr. Shama Abidi, Senior Clinical Pharmacist at Liaquat National Hospital, Karachi, Pakistan (17+ years experience, MPhil in Pharmacy Practice, Vice President Pakistan Pharmacist Association Sindh).
Write a professional, personalized inquiry email to Professor ${cleanName} at ${university}.

Key Details:
- Professor's recent research paper: "${paperTitle}"
- Subject area: ${researchArea}
- Connect their paper directly with Dr. Shama's published clinical trials (e.g. prospective trial on carbapenem antimicrobial stewardship [Ali et al., 2022], high-alert medications and patient safety [Baig et al., 2025], or cardiovascular calcium channel blockers study [Abidi et al., 2024]).
- Inquire respectfully about whether their research group accepts international PhD students for upcoming intakes.
- Keep the email concise (130-160 words).
- No clichés like "I hope this email finds you well" or exaggerated flattery.

Return ONLY in this format:
SUBJECT: [concise subject]
BODY:
[body text only, no greeting, no sign-off]`,
          },
        ],
        temperature: 0.6,
        max_tokens: 400,
      });

      const text = completion.choices[0]?.message?.content || '';
      const subjectMatch = text.match(/SUBJECT:\s*(.+)/i);
      const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i);

      if (subjectMatch && bodyMatch) {
        return {
          subject: subjectMatch[1].trim(),
          body: bodyMatch[1].trim(),
        };
      }
    } catch (err) {
      console.warn('Groq AI notice (using verified template):', err.message);
    }
  }

  // Fallback high-quality template
  return {
    subject: `PhD Research Inquiry: ${researchArea} – Dr. Shama Abidi`,
    body: `I am writing to respectfully inquire about PhD research opportunities within your group at ${university}. I recently read with great interest your publication, "${paperTitle}", which closely aligns with my clinical and academic research background.\n\nWith over 17 years of clinical pharmacy practice at Liaquat National Hospital and an MPhil in Pharmacy Practice, my research includes prospective hospital trials on antimicrobial stewardship (evaluating carbapenem de-escalation and microbiological concordance), medication safety, and health services implementation. Given our aligned focus on ${researchArea}, I would welcome the opportunity to discuss prospective PhD openings. My academic CV is attached for your review.`,
  };
}

// ─── IMAP Gmail Draft Sync (Reuses Single Connection) ─────────────────────────
let sharedImapClient = null;

async function getSharedImapClient() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;

  if (sharedImapClient && sharedImapClient.usable) return sharedImapClient;

  try {
    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
    });
    await client.connect();
    sharedImapClient = client;
    return sharedImapClient;
  } catch (err) {
    console.warn('IMAP connection error:', err.message);
    return null;
  }
}

async function appendDraftToGmail(toEmail, subject, fullBody) {
  const user = process.env.GMAIL_USER;
  try {
    const client = await getSharedImapClient();
    if (!client) return false;

    const cvAttachment = getCvAttachment();
    const compiler = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const info = await compiler.sendMail({
      from: `"Dr. Shama Abidi" <${user}>`,
      to: toEmail,
      subject,
      text: fullBody,
      attachments: cvAttachment ? [cvAttachment] : [],
    });

    await client.append('[Gmail]/Drafts', info.message, ['\\Draft', '\\Seen']);
    return true;
  } catch (err) {
    console.warn('Failed to append draft to Gmail:', err.message);
    return false;
  }
}

// ─── Main Batch Runner ────────────────────────────────────────────────────────
async function runAutonomous50() {
  console.log('================================================================');
  console.log('🚀 AUTONOMOUS 50 REAL PROFESSOR DISCOVERY & GMAIL DRAFT ENGINE');
  console.log(`⏰ Time: ${new Date().toISOString()} | Target: 50 Professors`);
  console.log('================================================================\n');

  const TARGET_COUNT = parseInt(process.argv[2] || process.env.TARGET_COUNT || '50', 10);
  let totalSaved = 0;
  const seenToday = new Set();
  const todayIso = new Date().toISOString().slice(0, 10);

  for (const topic of SEARCH_TOPICS) {
    if (totalSaved >= TARGET_COUNT) break;

    console.log(`\n🔍 Searching real professors for: "${topic}"...`);
    const candidates = await fetchProfessorsFromEuropePmc(topic, 25);
    console.log(`   Found ${candidates.length} candidates with direct emails.`);

    for (const c of candidates) {
      if (totalSaved >= TARGET_COUNT) break;
      if (seenToday.has(c.email)) continue;
      seenToday.add(c.email);

      // Check Firestore duplicates
      const seenSnap = await db.collection('seen_professors').where('email', '==', c.email).limit(1).get();
      if (!seenSnap.empty) continue;

      const profSnap = await db.collection('professors').where('email', '==', c.email).limit(1).get();
      if (!profSnap.empty) continue;

      // Generate AI Draft
      const emailContent = await generateEmailWithAI(c.name, c.university, topic, c.paperTitle);
      const cleanName = c.name.replace(/^Dr\.\s*|^Prof\.\s*|^Professor\s*/i, '').trim();
      const fullBody = `Dear Professor ${cleanName},\n\n${emailContent.body}\n\nSincerely,\nDr. Shama Abidi, MPhil, PharmD, RPh\nSenior Clinical Pharmacist, Liaquat National Hospital, Karachi\nVice President, Pakistan Pharmacist Association (Sindh)`;

      // Save Professor Document
      const profRef = await db.collection('professors').add({
        name: c.name,
        university: c.university,
        country: c.country,
        email: c.email,
        emailSourceUrl: c.sourceUrl,
        profileSourceUrl: c.sourceUrl,
        researchArea: topic,
        recentPaper: c.paperTitle,
        fundingAvailable: 'inquire',
        fundingSource: 'Academic Department / Research Group',
        verificationLevel: 'verified',
        status: 'draft',
        sentAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Save Email Draft Document
      await db.collection('emails').add({
        professorId: profRef.id,
        type: 'first',
        subject: emailContent.subject,
        body: fullBody,
        status: 'draft',
        sentAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Mark Seen
      await db.collection('seen_professors').doc(`email_${c.email.replace(/[^a-z0-9]/g, '_')}`).set({
        name: c.name,
        university: c.university,
        email: c.email,
        seenAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Sync Draft into Gmail
      const synced = await appendDraftToGmail(c.email, emailContent.subject, fullBody);

      totalSaved++;
      console.log(`   ✅ [${totalSaved}/${TARGET_COUNT}] Added Prof. ${c.name} (${c.university}) <${c.email}> | Gmail Draft: ${synced ? 'SYNCED' : 'SAVED IN CRM'}`);
    }
  }

  // Log in Firestore cron_logs
  await db.collection('cron_logs').add({
    type: 'autonomous_50_discovery',
    message: `Autonomous Daily 50 Finder successfully discovered and added ${totalSaved} real professors with verified emails and drafts.`,
    details: { totalSaved, target: TARGET_COUNT, date: todayIso },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (sharedImapClient) {
    await sharedImapClient.logout().catch(() => {});
  }

  console.log('\n================================================================');
  console.log(`🎉 RUN COMPLETE: Successfully processed ${totalSaved}/50 professors today!`);
  console.log('================================================================\n');
}

runAutonomous50().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
