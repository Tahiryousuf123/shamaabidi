const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── 1. Load Environment Variables from .env.local ───────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

// ─── 2. Configuration Parameters ──────────────────────────────────────────────
const CONTACT_EMAIL = (process.env.CONTACT_EMAIL || process.env.GMAIL_USER || 'shamaabidiphd@gmail.com').trim();
const USER_AGENT = `PhDReach-ShamaCRM/3.0 (mailto:${CONTACT_EMAIL})`;

const DAILY_TARGET = parseInt(process.env.DAILY_TARGET || '25', 10);
const DAILY_MIN = Math.min(20, DAILY_TARGET);
const DAILY_MAX = 30;
const GLOBAL_BUDGET_MIN = parseFloat(process.env.GLOBAL_BUDGET_MIN || '50');

const DISCOVER_MAX = parseInt(process.env.DISCOVER_MAX || '60', 10);
const EMAIL_MAX = parseInt(process.env.EMAIL_MAX || '40', 10);
const VERIFY_MAX = parseInt(process.env.VERIFY_MAX || '40', 10);
const RELEVANCE_THRESHOLD = parseInt(process.env.RELEVANCE_THRESHOLD || '30', 10);
const OA_SHARE = parseFloat(process.env.OA_SHARE || '0.8');

const DISCOVER_BUDGET_MIN = parseFloat(process.env.DISCOVER_BUDGET_MIN || '10');
const EMAIL_BUDGET_MIN = parseFloat(process.env.EMAIL_BUDGET_MIN || '20');
const VERIFY_BUDGET_MIN = parseFloat(process.env.VERIFY_BUDGET_MIN || '5');
const DRAFT_BUDGET_MIN = parseFloat(process.env.DRAFT_BUDGET_MIN || '25');

const NCBI_API_KEY = (process.env.NCBI_API_KEY || '').trim();
const CORE_API_KEY = (process.env.CORE_API_KEY || '').trim();
const CORE_MAX = parseInt(process.env.CORE_MAX || '100', 10);
const PERSONAL_MAX_SHARE = parseFloat(process.env.PERSONAL_MAX_SHARE || '0.2');

// ─── 3. Search Topics & Keywords ──────────────────────────────────────────────
const SEARCH_TOPICS = [
  'antimicrobial stewardship',
  'antibiotic resistance',
  'antibiotic prescribing',
  'hospital pharmacist',
  'medication safety',
  'medication errors',
  'high-alert medications',
  'pharmacovigilance',
  'adverse drug events',
  'polypharmacy',
  'deprescribing',
  'drug-drug interactions',
  'clinical pharmacy',
  'hospital pharmacy',
  'cardiovascular pharmacotherapy',
  'anticoagulation',
  'heart failure pharmacotherapy',
  'hypertension management',
  'pharmacy practice',
  'implementation science',
  'telepharmacy',
  'clinical decision support',
  'digital health',
  'AI in pharmacy',
  'medication adherence',
  'paediatric antibiotic use',
  'ICU antimicrobial use',
  'medication reconciliation',
];

const RELEVANCE_KEYWORDS = [
  'antimicrobial stewardship',
  'antibiotic resistance',
  'antibiotic prescribing',
  'hospital pharmacist',
  'medication safety',
  'medication error',
  'high-alert',
  'pharmacovigilance',
  'adverse drug event',
  'adverse drug reaction',
  'polypharmacy',
  'deprescribing',
  'drug interaction',
  'clinical pharmac',
  'hospital pharmac',
  'cardiovascular pharmacotherapy',
  'anticoagulat',
  'heart failure',
  'hypertension',
  'pharmacy practice',
  'implementation science',
  'telepharmacy',
  'decision support',
  'digital health',
  'artificial intelligence',
  'medication adherence',
  'pediatric antibiotic',
  'paediatric antibiotic',
  'icu antimicrobial',
  'medication reconciliation',
];

// ─── 4. Utility Functions ─────────────────────────────────────────────────────
function sha1(str) {
  return crypto.createHash('sha1').update(String(str || '')).digest('hex');
}

function normalizeKey(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function extractDomain(urlStr) {
  if (!urlStr) return null;
  try {
    const parsed = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── 5. Personal Webmail Domains & Author Validation ─────────────────────────
const PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'gmx.net',
  'mail.ru',
  'yandex.com',
  'yandex.ru',
  'rediffmail.com',
  'zoho.com',
  '126.com',
  '163.com',
  'qq.com',
  'sina.com',
  'yeah.net',
]);

const COMMON_SURNAMES = new Set([
  'chen', 'wang', 'li', 'zhang', 'liu', 'kim', 'lee', 'smith', 'singh', 'kumar',
  'khan', 'ali', 'garcia', 'martinez', 'rodriguez', 'lopez', 'hernandez', 'gonzalez',
  'perez', 'sanchez', 'ramirez', 'torres', 'flores', 'rivera', 'gomez', 'diaz',
  'cruz', 'morales', 'reyes', 'gutierrez', 'ortiz', 'ramos', 'chavez', 'patel',
  'shah', 'ahmed', 'hussain', 'sharma', 'gupta', 'das', 'roy', 'yang', 'wu',
  'huang', 'zhou', 'xu', 'zhao', 'zhu', 'sun', 'ma', 'gao', 'lin', 'he', 'guo',
  'zheng', 'liang', 'song', 'xie', 'tang', 'han', 'feng', 'deng', 'cao', 'peng',
  'zeng', 'xiao', 'tian', 'dong', 'yuan', 'pan', 'yu', 'jiang', 'cai', 'jia',
  'ding', 'wei', 'duan', 'ren', 'tan', 'fan', 'jin', 'zhong', 'lu', 'luo',
  'cheng', 'ye', 'su', 'fang', 'bai', 'cui', 'kang', 'qiu', 'meng', 'shao',
  'wong', 'chan', 'ng', 'ho', 'leung', 'lau', 'tanaka', 'sato', 'suzuki',
  'takahashi', 'watanabe', 'ito', 'yamamoto', 'nakamura', 'kobayashi', 'kato',
]);

const NON_PERSON_REGEX = /\b(group|working|consortium|team|collaborat\w*|committee|study|network|association)\b/i;

function isNonPersonAuthor(name) {
  if (!name || typeof name !== 'string') return true;
  return NON_PERSON_REGEX.test(name.trim());
}

const GENERATION_GAP_SEC = parseInt(process.env.GENERATION_GAP_SEC || '3', 10);
const RELEVANCE_STRONG = parseInt(process.env.RELEVANCE_STRONG || '70', 10);

const BLOCKED_ROLE_PREFIXES = [
  'noreply', 'no-reply', 'donotreply', 'support', 'info', 'admin', 'help', 'privacy',
  'contact', 'sales', 'billing', 'webmaster', 'postmaster', 'mailer-daemon', 'editor',
  'office', 'dept', 'department', 'enquir', 'inquir', 'hr', 'journal', 'permissions',
  'library', 'secretary', 'research', 'admissions', 'press', 'media', 'team',
  'service', 'news', 'reception', 'registrar',
];

function isBlockedRoleEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return true;
  const localPart = email.split('@')[0].toLowerCase().trim();
  for (const prefix of BLOCKED_ROLE_PREFIXES) {
    if (localPart === prefix || localPart.startsWith(prefix + '.') || localPart.startsWith(prefix + '_') || localPart.startsWith(prefix + '-')) {
      return true;
    }
    if (localPart.startsWith(prefix) && (localPart.length === prefix.length || !/^[a-z0-9]/.test(localPart.slice(prefix.length)))) {
      return true;
    }
  }
  return false;
}

// Negative / non-evidence-based topics that disqualify candidates
const NEGATIVE_TOPICS = [
  'homeopathy',
  'homeopathic',
  'naturopathy',
  'naturopathic',
  'chiropractic',
  'astrology',
  'energy healing',
  'acupuncture',
  'traditional chinese medicine',
  'ayurveda',
  'ayurvedic',
  'unani',
  'alternative medicine',
  'complementary and alternative',
  'complementary medicine',
];

// ─── 6. Dr. Shama Abidi Profile Facts (Only CV verified facts) ───────────────
const SHAMA_PROFILE = {
  name: 'Dr. Shama Abidi',
  // TODO: "PharmD, RPh" pending client confirmation from official CV documents
  credentials: 'MPhil, PharmD, RPh',
  currentRole: 'Senior Clinical Pharmacist, Liaquat National Hospital, Karachi, Pakistan',
  experienceYears: '17+',
  education: 'MPhil in Pharmacy Practice',
  clinicalTrials: [
    {
      // TODO: Ali et al., 2022 topic label and full publication citation details pending confirmation
      citation: 'Ali et al., 2022',
      topicCategory: 'antimicrobial_stewardship',
      focus: 'Prospective hospital trial on carbapenem antimicrobial stewardship evaluating de-escalation protocols and microbiological concordance',
    },
    {
      // TODO: Baig et al., 2025 topic label and full publication citation details pending confirmation
      citation: 'Baig et al., 2025',
      topicCategory: 'medication_safety',
      focus: 'Medication safety and high-alert medication administration monitoring in inpatient units',
    },
    {
      // TODO: Abidi et al., 2024 topic label and full publication citation details pending confirmation
      citation: 'Abidi et al., 2024',
      topicCategory: 'cardiovascular',
      focus: 'Cardiovascular pharmacotherapy comparing calcium channel blockers vs beta-blockers in clinical outcomes',
    },
  ],
  researchInterests: [
    'Clinical pharmacy practice and hospital implementation science',
    'Antimicrobial stewardship and resistance surveillance',
    'Medication safety, high-alert drugs, and error prevention',
    'Cardiovascular pharmacotherapy',
    'Clinical decision support systems and digital health tools in hospital pharmacy',
  ],
};

// ─── 7. Deterministic Sender Signature Block ──────────────────────────────────
// TODO: "PharmD, RPh" pending client confirmation from official CV documents
// TODO: Replace with Dr. Shama Abidi's real active phone and LinkedIn before running live outreach
const SENDER_SIGNATURE = `Sincerely,
Dr. Shama Abidi, MPhil, PharmD, RPh
Senior Clinical Pharmacist, Liaquat National Hospital, Karachi`;

module.exports = {
  CONTACT_EMAIL,
  USER_AGENT,
  DAILY_TARGET,
  DAILY_MIN,
  DAILY_MAX,
  GLOBAL_BUDGET_MIN,
  DISCOVER_MAX,
  EMAIL_MAX,
  VERIFY_MAX,
  RELEVANCE_THRESHOLD,
  RELEVANCE_STRONG,
  GENERATION_GAP_SEC,
  OA_SHARE,
  DISCOVER_BUDGET_MIN,
  EMAIL_BUDGET_MIN,
  VERIFY_BUDGET_MIN,
  DRAFT_BUDGET_MIN,
  SEARCH_TOPICS,
  RELEVANCE_KEYWORDS,
  NEGATIVE_TOPICS,
  PERSONAL_DOMAINS,
  COMMON_SURNAMES,
  NON_PERSON_REGEX,
  isNonPersonAuthor,
  BLOCKED_ROLE_PREFIXES,
  isBlockedRoleEmail,
  NCBI_API_KEY,
  CORE_API_KEY,
  CORE_MAX,
  PERSONAL_MAX_SHARE,
  SHAMA_PROFILE,
  SENDER_SIGNATURE,
  sha1,
  normalizeKey,
  extractDomain,
  sleep,
};
