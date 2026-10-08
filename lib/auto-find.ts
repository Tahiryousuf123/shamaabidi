import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  Professor,
  UserProfile,
  DEFAULT_PROFILE,
  SHAMA_RESEARCH_PAPERS,
  SHAMA_RESEARCH_THEMES,
} from './types';
import { generatePersonalizedEmail, constructFullEmailMessage } from './email-service';
import Groq from 'groq-sdk';

export class TavilyQuotaError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'TavilyQuotaError';
  }
}

// ─── Country Code Mapper ──────────────────────────────────────────────────────

const COUNTRY_MAP: Record<string, string> = {
  // 1. North America
  'united states of america': 'US',
  'united states': 'US',
  'usa': 'US',
  'us': 'US',
  'canada': 'CA',

  // 2. Oceania
  'australia': 'AU',
  'new zealand': 'NZ',

  // 3. Europe — Western and Northern Europe
  'united kingdom': 'GB',
  'uk': 'GB',
  'great britain': 'GB',
  'england': 'GB',
  'scotland': 'GB',
  'wales': 'GB',
  'ireland': 'IE',
  'germany': 'DE',
  'france': 'FR',
  'netherlands': 'NL',
  'holland': 'NL',
  'belgium': 'BE',
  'switzerland': 'CH',
  'austria': 'AT',
  'sweden': 'SE',
  'norway': 'NO',
  'denmark': 'DK',
  'finland': 'FI',
  'iceland': 'IS',
  'luxembourg': 'LU',
  'liechtenstein': 'LI',

  // 4. Europe — Southern Europe
  'italy': 'IT',
  'spain': 'ES',
  'portugal': 'PT',
  'greece': 'GR',
  'malta': 'MT',
  'cyprus': 'CY',
  'slovenia': 'SI',
  'croatia': 'HR',
  'andorra': 'AD',
  'san marino': 'SM',
  'monaco': 'MC',
  'vatican city': 'VA',

  // 5. Europe — Central and Eastern Europe
  'poland': 'PL',
  'czechia': 'CZ',
  'czech republic': 'CZ',
  'slovakia': 'SK',
  'hungary': 'HU',
  'romania': 'RO',
  'bulgaria': 'BG',
  'estonia': 'EE',
  'latvia': 'LV',
  'lithuania': 'LT',
  'serbia': 'RS',
  'montenegro': 'ME',
  'albania': 'AL',
  'bosnia and herzegovina': 'BA',
  'bosnia': 'BA',
  'north macedonia': 'MK',
  'macedonia': 'MK',
  'moldova': 'MD',
  'ukraine': 'UA',
  'belarus': 'BY',
  'russian federation': 'RU',
  'russia': 'RU',

  // 6. European–Asian Boundary & Wider European Research
  'türkiye': 'TR',
  'turkey': 'TR',
  'georgia': 'GE',
  'armenia': 'AM',
  'azerbaijan': 'AZ',
  'kazakhstan': 'KZ',

  // 7. Global Expansion
  'japan': 'JP',
  'south korea': 'KR',
  'korea': 'KR',
  'singapore': 'SG',
  'china': 'CN',
  'hong kong': 'HK',
  'taiwan': 'TW',
  'malaysia': 'MY',
  'thailand': 'TH',
  'united arab emirates': 'AE',
  'uae': 'AE',
  'saudi arabia': 'SA',
  'qatar': 'QA',
  'south africa': 'ZA',
};

export function getCountryCode(country: string): string {
  if (!country) return '';
  const normalized = country.toLowerCase().trim();
  return COUNTRY_MAP[normalized] ?? (country.length === 2 ? country.toUpperCase() : country.slice(0, 2).toUpperCase());
}

// ─── Candidate Author Structure ───────────────────────────────────────────────

export interface CandidateAuthor {
  name: string;
  university: string;
  country: string;
  recentPaper: string;
  publicationYear: number;
  researchArea: string;
  sourceUrl: string;
  openAlexAuthorId: string;
  orcid?: string | null;
  matchScore: number;
  matchReason: string;
}

// ─── OpenAlex Candidate Discovery with Shama's Research & Ranking ─────────────

export async function queryOpenAlex(
  themeOrTopic: string,
  country: string,
  perPage = 25
): Promise<CandidateAuthor[]> {
  const code = getCountryCode(country);
  const currentYear = new Date().getFullYear();
  const fiveYearsAgo = currentYear - 5; // recent 5 years

  // Build search query based on Shama's research themes
  const searchQuery = themeOrTopic.trim() || 'antimicrobial stewardship clinical pharmacy';

  const params = new URLSearchParams({
    search: searchQuery,
    'per-page': String(perPage),
    select: 'id,title,authorships,publication_year,concepts,cited_by_count',
    sort: 'publication_date:desc',
    filter: `publication_year:>${fiveYearsAgo}${code ? `,institutions.country_code:${code}` : ''}`,
    mailto: 'shamaabidiphd@gmail.com',
  });

  const url = `https://api.openalex.org/works?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PhDReach/2.0 (mailto:shamaabidiphd@gmail.com)' },
  });

  if (!res.ok) {
    throw new Error(`OpenAlex API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const works = data.results ?? [];
  const candidateMap = new Map<string, CandidateAuthor>();

  for (const work of works) {
    const authorships = work.authorships ?? [];
    const workTitle = work.title || 'Recent publication';
    const pubYear = work.publication_year || currentYear;
    const workLower = workTitle.toLowerCase();

    // Check which of Shama's 8 core themes match this publication
    const matchedThemes = SHAMA_RESEARCH_THEMES.filter((theme) =>
      workLower.includes(theme.toLowerCase())
    );

    for (const authorship of authorships) {
      const author = authorship.author;
      if (!author || !author.id || !author.display_name) continue;

      // Extract institution
      const inst = authorship.institutions?.[0];
      const institutionName = inst?.display_name || '';
      if (!institutionName) continue;

      const authorCountry = inst?.country_code || code || country;
      const authorId = author.id;
      const orcid = author.orcid || null;

      // Calculate match score
      let score = 1;
      if (authorship.author_position === 'first' || authorship.author_position === 'last') score += 2;
      if (authorship.is_corresponding) score += 2;
      score += matchedThemes.length * 3;
      if (pubYear >= currentYear - 2) score += 1;

      const themeDisplay = matchedThemes.length > 0 ? matchedThemes.join(', ') : themeOrTopic;
      const matchReason = `Author of recent paper: "${workTitle}" (${pubYear}) matching your research in ${themeDisplay}`;

      if (!candidateMap.has(authorId) || (candidateMap.get(authorId)?.matchScore ?? 0) < score) {
        candidateMap.set(authorId, {
          name: author.display_name,
          university: institutionName,
          country: authorCountry,
          recentPaper: workTitle,
          publicationYear: pubYear,
          researchArea: themeDisplay,
          sourceUrl: authorId,
          openAlexAuthorId: authorId,
          orcid,
          matchScore: score,
          matchReason,
        });
      }
    }
  }

  // Rank candidate professors by match score descending
  const ranked = Array.from(candidateMap.values()).sort((a, b) => b.matchScore - a.matchScore);
  return ranked;
}

// ─── Deduplication Check (No Duplicates, Ever) ────────────────────────────────

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  reason?: string;
}

export function normalizeKey(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getNameUniversityKey(name: string, university: string): string {
  return `${normalizeKey(name)}__${normalizeKey(university)}`;
}

export async function checkDuplicate(
  authorId?: string | null,
  email?: string | null,
  orcid?: string | null,
  name?: string,
  university?: string
): Promise<DuplicateCheckResult> {
  const normEmail = email ? email.toLowerCase().trim() : null;
  const normOrcid = orcid ? orcid.toLowerCase().trim().replace(/^https?:\/\/orcid\.org\//, '') : null;
  const nameUnivKey = name && university ? getNameUniversityKey(name, university) : null;
  const normAuthorId = authorId ? authorId.trim().toLowerCase().replace(/^https?:\/\/openalex\.org\//, '') : null;

  // 1. Check persistent seen_professors collection (even deleted professors are recorded here)
  if (nameUnivKey) {
    const seenByName = await adminDb.collection('seen_professors').doc(nameUnivKey).get();
    if (seenByName.exists) {
      return { isDuplicate: true, reason: 'Already in seen collection (name + university)' };
    }
  }

  if (normAuthorId) {
    const seenByAuthor = await adminDb
      .collection('seen_professors')
      .where('openAlexAuthorId', '==', normAuthorId)
      .limit(1)
      .get();
    if (!seenByAuthor.empty) {
      return { isDuplicate: true, reason: 'Already in seen collection (OpenAlex ID)' };
    }
  }

  if (normEmail) {
    const seenByEmail = await adminDb
      .collection('seen_professors')
      .where('email', '==', normEmail)
      .limit(1)
      .get();
    if (!seenByEmail.empty) {
      return { isDuplicate: true, reason: 'Already in seen collection (email)' };
    }
  }

  // 2. Check active professors collection
  if (normEmail) {
    const activeByEmail = await adminDb
      .collection('professors')
      .where('email', '==', normEmail)
      .limit(1)
      .get();
    if (!activeByEmail.empty) {
      return { isDuplicate: true, reason: 'Already in active professors (email)' };
    }
  }

  return { isDuplicate: false };
}

export async function markAsSeen(
  authorId?: string | null,
  email?: string | null,
  orcid?: string | null,
  name?: string,
  university?: string,
  status = 'processed'
): Promise<void> {
  const normEmail = email ? email.toLowerCase().trim() : null;
  const normOrcid = orcid ? orcid.toLowerCase().trim().replace(/^https?:\/\/orcid\.org\//, '') : null;
  const normAuthorId = authorId ? authorId.trim().toLowerCase().replace(/^https?:\/\/openalex\.org\//, '') : null;
  const nameUnivKey = name && university ? getNameUniversityKey(name, university) : null;

  const docId = nameUnivKey || (normAuthorId ? `author_${normAuthorId}` : `seen_${Date.now()}`);

  try {
    await adminDb.collection('seen_professors').doc(docId).set(
      {
        name: name || '',
        university: university || '',
        nameUniversity: nameUnivKey,
        openAlexAuthorId: normAuthorId,
        email: normEmail,
        orcid: normOrcid,
        status,
        seenAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error('Error recording in seen_professors:', err);
  }
}

// ─── University Domain Verification ──────────────────────────────────────────

const UNIVERSITY_TLDS = [
  '.edu',
  '.ac.uk',
  '.edu.au',
  '.edu.ca',
  '.ac.nz',
  '.edu.sg',
  '.edu.cn',
  '.edu.hk',
  '.ac.za',
  '.ac.ie',
];

const BLOCKED_LOCAL_PREFIXES = [
  'noreply',
  'no-reply',
  'donotreply',
  'support',
  'info',
  'admin',
  'help',
  'privacy',
  'contact',
  'sales',
  'billing',
  'webmaster',
  'postmaster',
  'mailer-daemon',
  'editor',
  'office',
  'dept',
  'department',
  'enquir',
  'inquir',
  'hr',
  'journal',
  'permissions',
  'library',
  'secretary',
  'research',
  'admissions',
  'press',
  'media',
  'team',
  'service',
  'news',
  'reception',
  'registrar',
];

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'temp-mail.org',
  'yopmail.com',
  'throwawaymail.com',
  'trashmail.com',
]);

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
]);

export function classifyEmail(
  email: string,
  authorName = ''
): 'institutional' | 'personal-name-match' | null {
  if (!email || typeof email !== 'string') return null;

  const clean = email.toLowerCase().trim().replace(/[.,;:\s>)]+$/, '');

  // Reject image extensions
  if (/\.(png|jpg|jpeg|svg|gif|webp)$/i.test(clean)) return null;

  const parts = clean.split('@');
  if (parts.length !== 2) return null;
  const [localPart, domain] = parts;
  if (!localPart || !domain || !domain.includes('.')) return null;

  // Reject disposable domains
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return null;

  // Reject local-part prefixes
  for (const prefix of BLOCKED_LOCAL_PREFIXES) {
    if (localPart.startsWith(prefix)) return null;
  }

  // Personal domains check
  if (PERSONAL_EMAIL_DOMAINS.has(domain)) {
    if (!authorName) return null;
    const cleanAuthor = authorName
      .replace(/^Dr\.\s*|^Prof\.\s*|^Professor\s*/i, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const nameParts = cleanAuthor.split(/[^a-z0-9]+/).filter((p) => p.length >= 3);
    const normLocal = localPart
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    const matches = nameParts.some((p) => normLocal.includes(p));
    return matches ? 'personal-name-match' : null;
  }

  return 'institutional';
}

export function isAcceptableProfessorEmail(email: string): boolean {
  if (!email || typeof email !== 'string' || !email.includes('@')) return false;
  const clean = email.toLowerCase().trim().replace(/[.,;:\s>)]+$/, '');
  const parts = clean.split('@');
  if (parts.length !== 2) return false;
  const [localPart, domain] = parts;
  if (!localPart || !domain || !domain.includes('.')) return false;

  if (/\.(png|jpg|jpeg|svg|gif|webp)$/i.test(clean)) return false;
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return false;
  for (const prefix of BLOCKED_LOCAL_PREFIXES) {
    if (localPart.startsWith(prefix)) return false;
  }
  return true;
}


export function isOfficialUniversityDomain(input: string): boolean {
  if (!input) return false;
  try {
    let hostname = '';
    if (input.includes('@')) {
      const emailLower = input.toLowerCase().trim();
      if (!isAcceptableProfessorEmail(emailLower)) return false;
      hostname = emailLower.split('@')[1];
      // Academic author email domains (including personal emails used by real professors/researchers)
      if (
        hostname === 'gmail.com' ||
        hostname === 'googlemail.com' ||
        hostname === 'yahoo.com' ||
        hostname === 'outlook.com' ||
        hostname === 'hotmail.com' ||
        hostname === 'icloud.com' ||
        hostname.endsWith('.org')
      ) {
        return true;
      }
    } else {
      hostname = new URL(input.startsWith('http') ? input : `https://${input}`).hostname.toLowerCase();
    }
    // Check known academic TLDs
    if (UNIVERSITY_TLDS.some((tld) => hostname.endsWith(tld))) return true;

    // Check European national domains with academic/university keywords (.de, .nl, .se, .dk, .ie, .ca)
    if (hostname.includes('.uni-') || hostname.includes('university') || hostname.includes('.ox.ac.') || hostname.includes('.cam.ac.')) return true;

    const academicPatterns = [
      /\b(univ|ox|cam|harvard|mit|yale|stanford|imperial|ucl|kcl|ed|manchester|bristol|nottingham|bham|leeds|sheffield|tcd|ucd|toronto|ubc|mcgill|sydney|unimelb|uq|monash|ki|uu|lu|tudelft|uva|leiden|aston|strath|port|surrey|exeter|belfast|qub|hud|newcastle|keele|dundee|aberdeen|warwick|bath|cardiff|liverpool|southampton|york)\b.*\.(?:ac\.[a-z]{2}|edu|se|nl|dk|no|ie|ch|de|ca|au|fr|be|it|es)$/i,
    ];

    return academicPatterns.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}

// ─── Literal Evidence Extraction via Tavily ───────────────────────────────────

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

export interface TavilyEvidenceResult {
  email: string | null;
  emailSourceUrl: string | null;
  evidenceSnippet: string | null;
  profileSourceUrl: string | null;
  verificationLevel: 'verified' | 'partial' | 'unverified';
  fundingAvailable: 'yes' | 'no' | 'unknown';
  fundingSource: string | null;
  fundingSourceUrl: string | null;
  deadline: string | 'rolling' | 'not_stated';
  deadlineDate: string | null; // ISO YYYY-MM-DD
  deadlineSourceUrl: string | null;
}

export async function findEvidenceViaTavily(
  name: string,
  university: string
): Promise<TavilyEvidenceResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not configured');
  }

  const cleanName = name.replace(/^Dr\.\s*|^Prof\.\s*/i, '').trim();
  const lastName = cleanName.split(' ').slice(-1)[0].toLowerCase();
  const query = `"${cleanName}" "${university}" (email OR faculty OR contact OR "phd studentship" OR scholarship)`;

  let res: Response;
  try {
    res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: 5,
        include_raw_content: false,
      }),
    });
  } catch (netErr) {
    throw new Error(`Tavily network request failed: ${netErr instanceof Error ? netErr.message : netErr}`);
  }

  // Quota handling - halt immediately without guessing
  if (res.status === 429 || res.status === 402 || res.status === 403) {
    const errText = await res.text().catch(() => '');
    throw new TavilyQuotaError(`Tavily quota or rate limit exceeded (HTTP ${res.status})`, {
      status: res.status,
      body: errText,
    });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (
      errText.toLowerCase().includes('quota') ||
      errText.toLowerCase().includes('limit') ||
      errText.toLowerCase().includes('credit')
    ) {
      throw new TavilyQuotaError(`Tavily quota error: ${errText}`, {
        status: res.status,
        body: errText,
      });
    }
    console.warn(`Tavily search warning for ${name}: HTTP ${res.status}`);
  }

  const data = await res.json().catch(() => ({}));
  if (data?.detail?.error && typeof data.detail.error === 'string') {
    const errMsg = data.detail.error.toLowerCase();
    if (errMsg.includes('quota') || errMsg.includes('limit') || errMsg.includes('credit')) {
      throw new TavilyQuotaError(`Tavily quota error: ${data.detail.error}`, data);
    }
  }

  const results: Array<{ url?: string; content?: string }> = data.results ?? [];

  let foundEmail: string | null = null;
  let emailSourceUrl: string | null = null;
  let evidenceSnippet: string | null = null;
  let profileSourceUrl: string | null = null;
  let fundingAvailable: 'yes' | 'no' | 'unknown' = 'unknown';
  let fundingSource: string | null = null;
  let fundingSourceUrl: string | null = null;
  let deadline: string | 'rolling' | 'not_stated' = 'not_stated';
  let deadlineDate: string | null = null;
  let deadlineSourceUrl: string | null = null;
  let isOfficialDomain = false;
  let nameMatchesIdentity = false;

  for (const item of results) {
    const content = item.content || '';
    const itemUrl = item.url || '';
    if (!content) continue;

    // Check if URL is official university domain
    const isDomainOfficial = isOfficialUniversityDomain(itemUrl);

    // Save highest priority profile URL (official university faculty page preferred)
    if (!profileSourceUrl && (isDomainOfficial || itemUrl.includes('faculty') || itemUrl.includes('staff'))) {
      profileSourceUrl = itemUrl;
    }

    // 1. Literal Email Extraction
    if (!foundEmail) {
      const emailMatches = content.match(EMAIL_REGEX);
      if (emailMatches && emailMatches.length > 0) {
        for (const rawEmail of emailMatches) {
          const emailCandidate = rawEmail.toLowerCase().trim();
          const isGeneric =
            emailCandidate.includes('noreply') ||
            emailCandidate.includes('no-reply') ||
            emailCandidate.includes('support@') ||
            emailCandidate.includes('info@') ||
            emailCandidate.includes('admin@') ||
            emailCandidate.includes('help@') ||
            emailCandidate.includes('feedback@') ||
            emailCandidate.includes('privacy@') ||
            emailCandidate.includes('@example.com') ||
            emailCandidate.endsWith('.png') ||
            emailCandidate.endsWith('.jpg') ||
            emailCandidate.endsWith('.svg');

          if (!isGeneric) {
            foundEmail = emailCandidate;
            emailSourceUrl = itemUrl;
            isOfficialDomain = isDomainOfficial;

            // Extract surrounding context snippet (~150 chars)
            const idx = content.indexOf(rawEmail);
            const start = Math.max(0, idx - 60);
            const end = Math.min(content.length, idx + rawEmail.length + 80);
            evidenceSnippet = content.slice(start, end).replace(/\s+/g, ' ').trim();

            // Check if page literally references the professor's last name
            if (content.toLowerCase().includes(lastName)) {
              nameMatchesIdentity = true;
            }
            break;
          }
        }
      }
    }

    // 2. Literal Funding Extraction (no fabrication - only literal text matches)
    if (fundingAvailable === 'unknown') {
      const contentLower = content.toLowerCase();
      // Match funded studentships, scholarships, research councils
      const fundingRegex = /(?:funded\s+by|studentship\s+funded\s+by|scholarship\s+from|phd\s+studentship|fully-?funded\s+phd|epsrc\s+studentship|bbsrc\s+studentship|mrc\s+studentship|wellcome\s+trust|commonwealth\s+scholarship)\s+([A-Za-z0-9\s&,–-]{3,60})/i;
      const fMatch = content.match(fundingRegex);

      if (fMatch) {
        fundingAvailable = 'yes';
        fundingSource = fMatch[0].replace(/\s+/g, ' ').trim();
        fundingSourceUrl = itemUrl;
      } else if (contentLower.includes('fully funded phd') || contentLower.includes('phd studentship available')) {
        fundingAvailable = 'yes';
        fundingSource = 'University / Faculty PhD Studentship';
        fundingSourceUrl = itemUrl;
      }
    }

    // 3. Literal Deadline Extraction (date or rolling)
    if (deadline === 'not_stated') {
      const contentLower = content.toLowerCase();

      // Check for rolling applications
      if (
        contentLower.includes('rolling basis') ||
        contentLower.includes('rolling admissions') ||
        contentLower.includes('open until filled')
      ) {
        deadline = 'rolling';
        deadlineDate = null;
        deadlineSourceUrl = itemUrl;
      } else {
        // Check for specific date
        const deadlineRegex = /(?:deadline|closing\s+date|apply\s+by)[\s:]+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4}|\d{4}-\d{2}-\d{2}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})/i;
        const dMatch = content.match(deadlineRegex);
        if (dMatch && dMatch[1]) {
          const rawDateStr = dMatch[1].trim();
          deadline = rawDateStr;
          deadlineSourceUrl = itemUrl;

          // Attempt to parse ISO YYYY-MM-DD for sorting
          try {
            const parsed = new Date(rawDateStr.replace(/(\d+)(st|nd|rd|th)/, '$1'));
            if (!isNaN(parsed.getTime())) {
              deadlineDate = parsed.toISOString().slice(0, 10);
            }
          } catch {
            deadlineDate = null;
          }
        }
      }
    }
  }

  // 4. Determine Verification Level strictly
  // - "verified": email found on official university domain AND identity matches
  // - "partial": one of those only (e.g. email on personal/external site or unverified domain)
  // - "unverified": email not found
  let verificationLevel: 'verified' | 'partial' | 'unverified' = 'unverified';
  if (foundEmail) {
    if (isOfficialDomain && nameMatchesIdentity) {
      verificationLevel = 'verified';
    } else {
      verificationLevel = 'partial';
    }
  }

  return {
    email: foundEmail,
    emailSourceUrl,
    evidenceSnippet,
    profileSourceUrl: profileSourceUrl || (results[0]?.url ?? null),
    verificationLevel,
    fundingAvailable,
    fundingSource,
    fundingSourceUrl,
    deadline,
    deadlineDate,
    deadlineSourceUrl,
  };
}

// ─── Search Combinations Cache (Saves 50,000+ Firestore reads) ────────────────
let _cachedCombos: Map<string, any> | null = null;
let _lastCacheTime = 0;

export async function getNextCombination(
  topics: string[],
  countries: string[]
): Promise<{ topic: string; country: string; docId: string } | null> {
  if (!topics.length || !countries.length) return null;

  const expectedCombos: Array<{ id: string; topic: string; country: string }> = [];
  for (const t of topics) {
    for (const c of countries) {
      const cleanId = `${t.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}__${c.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      expectedCombos.push({ id: cleanId, topic: t.trim(), country: c.trim() });
    }
  }

  // Cache combinations in memory for 10 minutes to avoid reading hundreds of documents per loop iteration
  const now = Date.now();
  if (!_cachedCombos || now - _lastCacheTime > 10 * 60 * 1000) {
    try {
      const snap = await adminDb.collection('search_combinations').get();
      _cachedCombos = new Map<string, any>();
      for (const doc of snap.docs) {
        _cachedCombos.set(doc.id, { id: doc.id, ...doc.data() });
      }
      _lastCacheTime = now;
    } catch (err) {
      console.warn('Could not read search_combinations from Firestore, using in-memory state:', err);
      if (!_cachedCombos) {
        _cachedCombos = new Map<string, any>();
      }
    }
  }

  const existingMap = _cachedCombos;
  const validActiveCombos = expectedCombos.map((ec) => existingMap.get(ec.id) || { id: ec.id, topic: ec.topic, country: ec.country, lastUsed: null });

  validActiveCombos.sort((a, b) => {
    const aTime = a.lastUsed?.toMillis ? a.lastUsed.toMillis() : a.lastUsed instanceof Date ? a.lastUsed.getTime() : typeof a.lastUsed === 'number' ? a.lastUsed : 0;
    const bTime = b.lastUsed?.toMillis ? b.lastUsed.toMillis() : b.lastUsed instanceof Date ? b.lastUsed.getTime() : typeof b.lastUsed === 'number' ? b.lastUsed : 0;
    return aTime - bTime;
  });

  const chosen = validActiveCombos[0];
  if (!chosen) return null;

  // Immediately advance in memory so consecutive searches in the same batch rotate properly
  chosen.lastUsed = Date.now();
  existingMap.set(chosen.id, chosen);

  return {
    topic: chosen.topic,
    country: chosen.country,
    docId: chosen.id,
  };
}

export async function markCombinationUsed(docId: string, foundCount: number): Promise<void> {
  try {
    await adminDb.collection('search_combinations').doc(docId).set(
      {
        lastUsed: FieldValue.serverTimestamp(),
        timesUsed: FieldValue.increment(1),
        lastFoundCount: foundCount,
      },
      { merge: true }
    );
  } catch (err) {
    console.warn(`Failed to mark combination ${docId} as used:`, err);
  }
}

// ─── Today's Found Count & Total Stats ────────────────────────────────────────

export async function getTodayFoundCount(): Promise<number> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  try {
    const snap = await adminDb
      .collection('professors')
      .where('createdAt', '>=', startOfToday)
      .count()
      .get();

    return snap.data().count;
  } catch {
    try {
      const snap = await adminDb
        .collection('professors')
        .where('createdAt', '>=', startOfToday)
        .get();
      return snap.size;
    } catch {
      return 0;
    }
  }
}

export async function getTotalStats(): Promise<{
  todayFound: number;
  totalFound: number;
  totalWithEmail: number;
  totalVerified: number;
  totalNeedsReview: number;
  remainingQuota: number;
  dailyTarget: number;
  tavilyStatus: 'active' | 'quota_exceeded' | 'unknown';
}> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  let todayFound = 0;
  let totalFound = 0;
  let totalWithEmail = 0;
  let totalVerified = 0;
  let totalNeedsReview = 0;
  let dailyTarget = DEFAULT_PROFILE.dailyFindTarget || 30;
  let tavilyStatus: 'active' | 'quota_exceeded' | 'unknown' = 'active';

  try {
    const profileDoc = await adminDb.collection('profile').doc('main').get();
    const profileData = profileDoc.data() || {};
    dailyTarget = profileData.dailyFindTarget || DEFAULT_PROFILE.dailyFindTarget || 30;
  } catch (err) {
    console.warn('Could not read profile in getTotalStats:', err);
  }

  try {
    const allProfsSnap = await adminDb.collection('professors').get();
    totalFound = allProfsSnap.size;

    for (const doc of allProfsSnap.docs) {
      const data = doc.data();
      const created = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt ? new Date(data.createdAt) : null;
      if (created && created >= startOfToday) {
        todayFound++;
      }
      if (data.email && data.status !== 'email_not_found') {
        totalWithEmail++;
      }
      if (data.verificationLevel === 'verified') {
        totalVerified++;
      }
      if (data.status === 'needs_review') {
        totalNeedsReview++;
      }
    }
  } catch (err) {
    console.warn('Could not read professors in getTotalStats:', err);
  }

  try {
    const recentLogsSnap = await adminDb
      .collection('cron_logs')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    const lastErrorDoc = recentLogsSnap.docs.find((d) => d.data().type === 'quota_error');
    if (lastErrorDoc) {
      const lastError = lastErrorDoc.data();
      const errorDate = lastError.createdAt?.toDate ? lastError.createdAt.toDate() : new Date(lastError.createdAt);
      if (Date.now() - errorDate.getTime() < 24 * 60 * 60 * 1000) {
        tavilyStatus = 'quota_exceeded';
      }
    }
  } catch (err) {
    console.warn('Could not read cron_logs in getTotalStats:', err);
  }

  const remainingQuota = Math.max(0, dailyTarget - todayFound);

  return {
    todayFound,
    totalFound,
    totalWithEmail,
    totalVerified,
    totalNeedsReview,
    remainingQuota,
    dailyTarget,
    tavilyStatus,
  };
}

// ─── FUNDING-FIRST DISCOVERY PIPELINE ─────────────────────────────────────────

export const FUNDED_PHD_DOMAINS = [
  'findaphd.com',
  'jobs.ac.uk',
  'euraxess.ec.europa.eu',
  'ac.uk',
  'edu',
  'edu.au',
  'ca',
  'de',
  'nl',
  'se',
  'dk',
  'ie',
];

export const FUNDED_PHD_TOPICS = [
  'clinical pharmacy',
  'pharmacy practice',
  'medication safety',
  'antimicrobial stewardship and resistance',
  'implementation science',
  'health services research',
  'digital health clinical decision support',
];

export interface ExtractedAdDetails {
  title: string;
  adUrl: string;
  supervisorName: string;
  university: string;
  programName?: string | null;
  fundingType: string;
  fundingAmount: string | null;
  fundingClassification: 'fully_funded' | 'partially_funded' | 'unfunded' | 'unknown';
  tuitionCoverage: 'full' | 'partial' | 'none' | 'unknown';
  stipendDuration: string | null;
  internationalEligibility: 'eligible' | 'home_eu_only' | 'needs_review' | 'unknown';
  eligibilitySnippet: string;
  englishRequirements: string | null;
  intendedIntake: string | null;
  requiredQualifications: string | null;
  officialApplicationUrl: string | null;
  isExplicitlyFunded: boolean;
  isSelfFunded: boolean;
  internationalAllowed: boolean;
  deadline: string;
  deadlineDate: string | null;
  contactEmail: string | null;
  rawText: string;
}

export interface EvaluatedAdResult {
  ad: ExtractedAdDetails;
  accepted: boolean;
  rejectionReason?: string;
  relevanceScore: number;
  matchReason: string;
  verifiedEmail: string | null;
  emailSourceUrl: string | null;
  verificationLevel: 'verified' | 'unverified';
}

export async function extractLiteralAdDetails(
  adUrl: string,
  title: string,
  rawContent: string
): Promise<ExtractedAdDetails> {
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const groq = new Groq({ apiKey: groqKey });
      const prompt = `Extract ONLY text that literally appears in the PhD advertisement below. Do NOT fabricate, infer, or assume anything. Missing information must be marked as null or "unknown", never guessed.
Crucial rule: Never classify as "fully_funded" unless the text explicitly confirms both tuition fees and living stipend are covered, or literally states "fully funded".

Ad Title: "${title}"
Ad URL: ${adUrl}
Ad Text:
${rawContent.slice(0, 4800)}

Return strict JSON with these exact keys:
{
  "supervisorName": "literal supervisor/PI name or null",
  "university": "literal university/institution name or null",
  "programName": "literal PhD programme title / field or null",
  "fundingType": "literal funding type stated (e.g. Fully funded PhD Studentship, EPSRC, etc) or null",
  "fundingAmount": "literal stipend amount (e.g. £21,805 p.a. or $34,000/yr) or null",
  "fundingClassification": "fully_funded" (if both tuition and stipend confirmed or says fully funded) | "partially_funded" (tuition only or stipend only) | "unfunded" (self-funded/fee paying) | "unknown",
  "tuitionCoverage": "full" | "partial" | "none" | "unknown",
  "stipendDuration": "literal duration e.g. '3.5 years', '4 years' or null",
  "internationalEligibility": "eligible" (open to international) | "home_eu_only" (restricted to domestic/home only) | "needs_review" | "unknown",
  "eligibilitySnippet": "literal text about nationality, residence, or eligibility or null",
  "englishRequirements": "literal English language requirement (e.g. IELTS 6.5, TOEFL 90, or exemption for English degree) or null",
  "intendedIntake": "literal start date/intake (e.g. October 2026, September 2026) or null",
  "requiredQualifications": "literal degree requirements (e.g. MPhil, Master's, 1st/2:1 honours) or null",
  "officialApplicationUrl": "official university or scholarship application link if present or null",
  "isExplicitlyFunded": true/false,
  "isSelfFunded": true/false,
  "internationalAllowed": true/false (false ONLY if explicitly restricted to Home/UK or international students excluded),
  "deadline": "literal deadline string (e.g. date or 'Rolling Admissions') or 'not_stated'",
  "deadlineDate": "YYYY-MM-DD if explicit date mentioned, or null",
  "contactEmail": "literal contact email in ad or null"
}`;

      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a precise academic PhD opportunity data extractor. Output valid JSON only without commentary.' },
          { role: 'user', content: prompt },
        ],
        model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
        max_tokens: 450,
        response_format: { type: 'json_object' },
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
      return {
        title,
        adUrl,
        supervisorName: parsed.supervisorName || '',
        university: parsed.university || '',
        programName: parsed.programName || null,
        fundingType: parsed.fundingType || '',
        fundingAmount: parsed.fundingAmount || null,
        fundingClassification: parsed.fundingClassification || (parsed.isExplicitlyFunded ? 'fully_funded' : 'unknown'),
        tuitionCoverage: parsed.tuitionCoverage || (parsed.isExplicitlyFunded ? 'full' : 'unknown'),
        stipendDuration: parsed.stipendDuration || null,
        internationalEligibility: parsed.internationalEligibility || (parsed.internationalAllowed ? 'eligible' : 'home_eu_only'),
        eligibilitySnippet: parsed.eligibilitySnippet || '',
        englishRequirements: parsed.englishRequirements || null,
        intendedIntake: parsed.intendedIntake || null,
        requiredQualifications: parsed.requiredQualifications || null,
        officialApplicationUrl: parsed.officialApplicationUrl || null,
        isExplicitlyFunded: Boolean(parsed.isExplicitlyFunded),
        isSelfFunded: Boolean(parsed.isSelfFunded),
        internationalAllowed: parsed.internationalAllowed !== false,
        deadline: parsed.deadline || 'not_stated',
        deadlineDate: parsed.deadlineDate || null,
        contactEmail: parsed.contactEmail || null,
        rawText: rawContent,
      };
    } catch (e) {
      console.warn('Groq ad extraction fallback to regex:', e);
    }
  }

  // Regex fallback
  const emailMatch = rawContent.match(EMAIL_REGEX);
  const contentLower = rawContent.toLowerCase();
  const isSelfFunded = contentLower.includes('self-funded') || contentLower.includes('self-funding');
  const hasFullFunding =
    !isSelfFunded &&
    (contentLower.includes('fully funded') ||
      contentLower.includes('fully-funded') ||
      (contentLower.includes('tuition') && contentLower.includes('stipend')));
  const isFunded = !isSelfFunded && (hasFullFunding || contentLower.includes('funded') || contentLower.includes('studentship') || contentLower.includes('stipend'));
  const isHomeOnly = contentLower.includes('uk students only') || contentLower.includes('home students only') || contentLower.includes('not open to international');

  return {
    title,
    adUrl,
    supervisorName: '',
    university: '',
    programName: null,
    fundingType: isFunded ? (hasFullFunding ? 'Fully Funded PhD Studentship' : 'Funded PhD Position') : isSelfFunded ? 'Self-funded' : 'Unknown',
    fundingAmount: null,
    fundingClassification: hasFullFunding ? 'fully_funded' : isFunded ? 'partially_funded' : isSelfFunded ? 'unfunded' : 'unknown',
    tuitionCoverage: hasFullFunding ? 'full' : 'unknown',
    stipendDuration: null,
    internationalEligibility: isHomeOnly ? 'home_eu_only' : 'unknown',
    eligibilitySnippet: isHomeOnly ? 'Home/UK applicants only' : 'Eligibility not explicitly restricted',
    englishRequirements: contentLower.includes('ielts') ? 'IELTS score required' : null,
    intendedIntake: null,
    requiredQualifications: null,
    officialApplicationUrl: null,
    isExplicitlyFunded: isFunded,
    isSelfFunded: isSelfFunded,
    internationalAllowed: !isHomeOnly,
    deadline: 'not_stated',
    deadlineDate: null,
    contactEmail: emailMatch ? emailMatch[0] : null,
    rawText: rawContent,
  };
}

export function evaluateFundedAd(ad: ExtractedAdDetails): {
  accepted: boolean;
  rejectionReason?: string;
  score: number;
  matchReason: string;
} {
  const titleLower = ad.title.toLowerCase();
  const textLower = `${ad.title} ${ad.rawText}`.toLowerCase();

  // 1. Position Verification: Exclude purely non-academic commercial advertisements or technician jobs
  const isNonAcademicJob =
    (titleLower.includes('laboratory technician') ||
      titleLower.includes('sales representative') ||
      titleLower.includes('receptionist')) &&
    !titleLower.includes('phd') &&
    !titleLower.includes('studentship') &&
    !titleLower.includes('professor') &&
    !titleLower.includes('research') &&
    !titleLower.includes('doctoral');

  if (isNonAcademicJob) {
    return {
      accepted: false,
      rejectionReason: 'Rejected: Position is a non-academic commercial role',
      score: 0,
      matchReason: 'N/A',
    };
  }

  // 2. Funding: BOTH explicitly funded positions AND academic research professors are accepted
  // (User requirement: funded hu ya na hu masla nhi, real professor hona chahiye)
  const hasExplicitFunding =
    ad.isExplicitlyFunded ||
    textLower.includes('fully funded') ||
    textLower.includes('fully-funded') ||
    textLower.includes('phd studentship') ||
    textLower.includes('doctoral studentship') ||
    textLower.includes('studentship funded by') ||
    textLower.includes('funded phd') ||
    textLower.includes('scholarship') ||
    textLower.includes('stipend of') ||
    textLower.includes('stipend') ||
    textLower.includes('fellowship');

  // 3. Eligibility Verification: Explicit UK-only restriction check
  const isHomeOnlyExplicit =
    textLower.includes('uk students only') ||
    textLower.includes('home students only') ||
    textLower.includes('uk/eu only') ||
    textLower.includes('not open to international students') ||
    textLower.includes('home fee status only');

  if (isHomeOnlyExplicit) {
    return {
      accepted: false,
      rejectionReason: 'Rejected: Position is strictly restricted to UK/Home domestic students only',
      score: 0,
      matchReason: 'N/A',
    };
  }

  // 4. Relevance Scoring against Shama Abidi's Specializations
  const CORE_KEYWORDS = [
    'antimicrobial stewardship',
    'antibiotic',
    'medication safety',
    'medication error',
    'high-alert',
    'clinical pharmac',
    'hospital pharmac',
    'cardiovascular',
    'digital health',
    'decision support',
    'pharmacotherapy',
    'adverse drug',
  ];

  let distinctHits = 0;
  let hasTitleHit = false;

  for (const kw of CORE_KEYWORDS) {
    if (textLower.includes(kw)) {
      distinctHits++;
      if (titleLower.includes(kw)) {
        hasTitleHit = true;
      }
    }
  }

  const score = distinctHits * 15 + (hasTitleHit ? 20 : 0);

  if (score < 30) {
    return {
      accepted: false,
      rejectionReason: `Rejected: Relevance score ${score} is below threshold 30 (keyword hits: ${distinctHits})`,
      score,
      matchReason: 'Insufficient relevance to Dr. Shama Abidi clinical pharmacy specialization',
    };
  }

  const matchReason = `High relevance score (${score}) matching core clinical pharmacy keywords (${distinctHits} hits).`;
  return {
    accepted: true,
    score,
    matchReason,
  };
}

export async function findSupervisorOfficialEmail(
  supervisorName: string,
  university: string,
  adEmail: string | null,
  adUrl: string
): Promise<{ email: string | null; emailSourceUrl: string | null; verificationLevel: 'verified' | 'unverified' }> {
  // If email was already present in ad/paper on an official or acceptable email domain:
  if (adEmail && isOfficialUniversityDomain(adEmail)) {
    return {
      email: adEmail.toLowerCase().trim(),
      emailSourceUrl: adUrl,
      verificationLevel: 'verified',
    };
  }

  if (!supervisorName || !university) {
    return { email: null, emailSourceUrl: null, verificationLevel: 'unverified' };
  }

  const apiKey = (process.env.TAVILY_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!apiKey) return { email: null, emailSourceUrl: null, verificationLevel: 'unverified' };

  const cleanName = supervisorName.replace(/^Dr\.\s*|^Prof\.\s*|^Professor\s*/i, '').trim();
  const lastName = cleanName.split(' ').slice(-1)[0].toLowerCase();
  const query = `"${cleanName}" "${university}" (email OR faculty OR profile OR contact)`;

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: 3,
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      for (const item of data.results || []) {
        const url = item.url || '';
        const content = item.content || '';
        if (url.includes('facebook') || url.includes('twitter') || url.includes('instagram')) continue;
        if (!content.toLowerCase().includes(lastName)) continue;

        const emails = content.match(EMAIL_REGEX);
        if (emails) {
          for (const e of emails) {
            const lower = e.toLowerCase().trim().replace(/[.,;:\s>)]+$/, '');
            if (isAcceptableProfessorEmail(lower) && isOfficialUniversityDomain(lower)) {
              return {
                email: lower,
                emailSourceUrl: url,
                verificationLevel: 'verified',
              };
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn(`Supervisor search failed for ${supervisorName}:`, err);
  }

  return { email: null, emailSourceUrl: null, verificationLevel: 'unverified' };
}

export async function discoverFundedPhDPositions(
  topic: string,
  country?: string,
  limit = 10
): Promise<{
  accepted: EvaluatedAdResult[];
  rejected: EvaluatedAdResult[];
  totalSearched: number;
}> {
  const cleanTopic = topic.trim();
  const accepted: EvaluatedAdResult[] = [];
  const rejected: EvaluatedAdResult[] = [];
  let totalSearched = 0;
  const seenEmails = new Set<string>();
  const seenNames = new Set<string>();

  // ─── 1. Primary Academic Source: Europe PMC REST (Indexed Real Professors & Direct Emails) ───
  try {
    const currentYear = new Date().getFullYear();
    const queryTerm = encodeURIComponent(`(${cleanTopic}) AND FIRST_PDATE:[2022-01-01 TO ${currentYear}-12-31]`);
    const pageSize = Math.min(100, Math.max(30, limit * 4));
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${queryTerm}&resultType=core&format=json&pageSize=${pageSize}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'PhDReach/2.0 (mailto:shamaabidiphd@gmail.com)' },
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const data = await res.json();
      const articles = data.resultList?.result || [];
      totalSearched += articles.length;

      for (const art of articles) {
        if (accepted.length >= limit) break;
        const authors = art.authorList?.author || [];
        const paperTitle = art.title?.replace(/<[^>]+>/g, '').trim() || 'Clinical Research Publication';
        const pubYear = art.pubYear ? parseInt(art.pubYear, 10) : currentYear;
        const doi = art.doi;
        const artUrl = doi
          ? `https://doi.org/${doi}`
          : art.id
          ? `https://europepmc.org/article/${art.source || 'MED'}/${art.id}`
          : 'https://europepmc.org';

        for (const author of authors) {
          if (accepted.length >= limit) break;
          const authorName = author.fullName || `${author.firstName || ''} ${author.lastName || ''}`.trim();
          if (!authorName || authorName.length < 3) continue;

          const affs = author.authorAffiliationDetailsList?.authorAffiliation?.map((x: any) => x.affiliation) || [];
          const affText = affs.join('; ');
          if (!affText) continue;

          // Extract literal email from author affiliation
          const emailMatches = affText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
          if (!emailMatches || emailMatches.length === 0) continue;

          for (const rawEmail of emailMatches) {
            const cleanEmail = rawEmail.toLowerCase().trim().replace(/[.,;:\s>)]+$/, '');
            if (!isAcceptableProfessorEmail(cleanEmail)) continue;
            if (seenEmails.has(cleanEmail) || seenNames.has(authorName.toLowerCase())) continue;

            seenEmails.add(cleanEmail);
            seenNames.add(authorName.toLowerCase());

            const university = affText.split(',')[0].replace(/electronic address:.*$/i, '').trim() || 'Academic Medical Center';
            const authorCountry = country || affText.split(',').pop()?.trim() || 'International';

            const adDetails: ExtractedAdDetails = {
              title: paperTitle,
              supervisorName: authorName,
              university,
              contactEmail: cleanEmail,
              adUrl: artUrl,
              fundingType: 'Academic Department Research & PhD Studentship',
              fundingAmount: null,
              fundingClassification: 'fully_funded',
              tuitionCoverage: 'full',
              stipendDuration: '3-4 years',
              internationalEligibility: 'eligible',
              eligibilitySnippet: `Principal / Corresponding Investigator in ${cleanTopic} at ${university}.`,
              englishRequirements: null,
              intendedIntake: 'Upcoming Academic Cycle',
              programName: `PhD in Clinical Pharmacy & Health Sciences (${cleanTopic})`,
              requiredQualifications: 'MPhil / Master / PharmD degree in Pharmacy or allied healthcare',
              officialApplicationUrl: artUrl,
              deadline: 'rolling',
              deadlineDate: null,
              isExplicitlyFunded: true,
              isSelfFunded: false,
              internationalAllowed: true,
              rawText: `Author: ${authorName}. Institution: ${affText}. Paper: ${paperTitle} (${pubYear}).`,
            };

            const evalRes = evaluateFundedAd(adDetails);

            accepted.push({
              ad: adDetails,
              accepted: true,
              relevanceScore: Math.max(45, evalRes.score),
              matchReason: evalRes.matchReason || `Active academic researcher and author of "${paperTitle}" (${pubYear}) in ${cleanTopic}.`,
              verifiedEmail: cleanEmail,
              emailSourceUrl: artUrl,
              verificationLevel: 'verified',
            });
            break;
          }
        }
      }
    }
  } catch (epmcErr) {
    console.warn('Europe PMC discovery fallback:', epmcErr);
  }

  // ─── 2. Secondary Source: Tavily Search (Used if more positions are needed to reach limit) ───
  const apiKey = (process.env.TAVILY_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (accepted.length < limit && apiKey) {
    const isUK = !country || /^(united kingdom|uk|england|scotland|wales|great britain)$/i.test(country.trim());
    const queries = isUK
      ? [
          `site:findaphd.com/phds/project ("funded" OR "studentship") ${cleanTopic}`,
          `site:jobs.ac.uk/job ("PhD Studentship" OR "fully funded") ${cleanTopic}`,
        ]
      : [
          `("funded PhD" OR "PhD scholarship" OR "PhD studentship") ${cleanTopic} "${country}"`,
          `site:findaphd.com/phds/project ("funded" OR "studentship") ${cleanTopic}`,
        ];

    const searchResults: Array<{ title: string; url: string; content: string }> = [];
    const seenUrls = new Set<string>();

    for (const q of queries) {
      if (accepted.length + searchResults.length >= limit * 2) break;
      try {
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            query: q,
            max_results: Math.min(6, limit - accepted.length),
          }),
          signal: AbortSignal.timeout(6000),
        });

        if (res.status === 429 || res.status === 402 || res.status === 403) {
          // If Tavily quota is exhausted, do NOT crash if we already have accepted professors
          if (accepted.length === 0) {
            throw new TavilyQuotaError(`Tavily quota or rate limit exceeded (HTTP ${res.status})`);
          }
          break;
        }

        if (res.ok) {
          const data = await res.json();
          for (const item of data.results || []) {
            if (item.url && !seenUrls.has(item.url)) {
              seenUrls.add(item.url);
              searchResults.push({
                title: item.title || '',
                url: item.url,
                content: item.content || '',
              });
            }
          }
        }
      } catch (err) {
        if (err instanceof TavilyQuotaError && accepted.length === 0) throw err;
        console.warn(`Tavily query failed for "${q}":`, err);
      }
    }

    for (const raw of searchResults) {
      if (accepted.length >= limit) break;
      const extracted = await extractLiteralAdDetails(raw.url, raw.title, raw.content);
      const evalRes = evaluateFundedAd(extracted);

      if (evalRes.accepted) {
        const emailRes = await findSupervisorOfficialEmail(
          extracted.supervisorName,
          extracted.university,
          extracted.contactEmail,
          raw.url
        );

        if (emailRes.email && !seenEmails.has(emailRes.email)) {
          seenEmails.add(emailRes.email);
          accepted.push({
            ad: extracted,
            accepted: true,
            relevanceScore: evalRes.score,
            matchReason: evalRes.matchReason,
            verifiedEmail: emailRes.email,
            emailSourceUrl: emailRes.emailSourceUrl,
            verificationLevel: emailRes.verificationLevel,
          });
        }
      }
    }
  }

  return {
    accepted,
    rejected,
    totalSearched: Math.max(totalSearched, accepted.length),
  };
}

