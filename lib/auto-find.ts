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

export function isOfficialUniversityDomain(input: string): boolean {
  if (!input) return false;
  try {
    let hostname = '';
    if (input.includes('@')) {
      hostname = input.split('@')[1].toLowerCase().trim();
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

// ─── Search Combination Rotation using lastUsed ───────────────────────────────

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

  const snap = await adminDb.collection('search_combinations').get();
  const existingMap = new Map<string, any>();
  for (const doc of snap.docs) {
    existingMap.set(doc.id, { id: doc.id, ...doc.data() });
  }

  const batch = adminDb.batch();
  let createdCount = 0;
  for (const combo of expectedCombos) {
    if (!existingMap.has(combo.id)) {
      const ref = adminDb.collection('search_combinations').doc(combo.id);
      batch.set(ref, {
        topic: combo.topic,
        country: combo.country,
        lastUsed: null,
        timesUsed: 0,
        lastFoundCount: 0,
      });
      existingMap.set(combo.id, {
        id: combo.id,
        topic: combo.topic,
        country: combo.country,
        lastUsed: null,
        timesUsed: 0,
        lastFoundCount: 0,
      });
      createdCount++;
    }
  }
  if (createdCount > 0) {
    await batch.commit().catch((e) => console.error('Error seeding combinations:', e));
  }

  const validActiveCombos = expectedCombos.map((ec) => existingMap.get(ec.id)).filter(Boolean);

  validActiveCombos.sort((a, b) => {
    const aTime = a.lastUsed?.toMillis ? a.lastUsed.toMillis() : a.lastUsed instanceof Date ? a.lastUsed.getTime() : 0;
    const bTime = b.lastUsed?.toMillis ? b.lastUsed.toMillis() : b.lastUsed instanceof Date ? b.lastUsed.getTime() : 0;
    return aTime - bTime;
  });

  const chosen = validActiveCombos[0];
  if (!chosen) return null;

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
    console.error(`Failed to mark combination ${docId} as used:`, err);
  }
}

// ─── Today's Found Count & Total Stats ────────────────────────────────────────

export async function getTodayFoundCount(): Promise<number> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const snap = await adminDb
    .collection('professors')
    .where('createdAt', '>=', startOfToday)
    .get();

  return snap.size;
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

  const profileDoc = await adminDb.collection('profile').doc('main').get();
  const profileData = profileDoc.data() || {};
  const dailyTarget = profileData.dailyFindTarget || DEFAULT_PROFILE.dailyFindTarget || 30;

  const allProfsSnap = await adminDb.collection('professors').get();
  let todayFound = 0;
  let totalWithEmail = 0;
  let totalVerified = 0;
  let totalNeedsReview = 0;

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

  // Check last quota error log in memory
  const recentLogsSnap = await adminDb
    .collection('cron_logs')
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();

  let tavilyStatus: 'active' | 'quota_exceeded' | 'unknown' = 'active';
  const lastErrorDoc = recentLogsSnap.docs.find((d) => d.data().type === 'quota_error');
  if (lastErrorDoc) {
    const lastError = lastErrorDoc.data();
    const errorDate = lastError.createdAt?.toDate ? lastError.createdAt.toDate() : new Date(lastError.createdAt);
    if (Date.now() - errorDate.getTime() < 24 * 60 * 60 * 1000) {
      tavilyStatus = 'quota_exceeded';
    }
  }

  const remainingQuota = Math.max(0, dailyTarget - todayFound);

  return {
    todayFound,
    totalFound: allProfsSnap.size,
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

  // 1. Position Verification: Must be a PhD / doctoral position, not an academic job vacancy
  const isAcademicJob =
    (titleLower.includes('lecturer') ||
      titleLower.includes('associate professor') ||
      titleLower.includes('senior lecturer') ||
      titleLower.includes('chair in') ||
      titleLower.includes('postdoctoral research fellow') ||
      titleLower.includes('laboratory technician')) &&
    !titleLower.includes('phd') &&
    !titleLower.includes('studentship') &&
    !titleLower.includes('doctoral');

  if (isAcademicJob) {
    return {
      accepted: false,
      rejectionReason: 'Rejected: Position is a faculty/staff job vacancy, not a funded PhD studentship',
      score: 0,
      matchReason: 'N/A',
    };
  }

  // 2. Funding Verification: Explicitly stated AND NOT self-funded
  if (
    ad.isSelfFunded ||
    textLower.includes('self-funded phd students only') ||
    textLower.includes('self-funded only') ||
    textLower.includes('this is a self-funded phd opportunity')
  ) {
    return {
      accepted: false,
      rejectionReason: 'Rejected: Position is self-funded only (no institutional or grant stipend provided)',
      score: 0,
      matchReason: 'N/A',
    };
  }

  const hasExplicitFunding =
    ad.isExplicitlyFunded ||
    textLower.includes('fully funded') ||
    textLower.includes('fully-funded') ||
    textLower.includes('phd studentship') ||
    textLower.includes('doctoral studentship') ||
    textLower.includes('studentship funded by') ||
    textLower.includes('funded phd') ||
    textLower.includes('scholarship') ||
    textLower.includes('stipend of');

  if (!hasExplicitFunding) {
    return {
      accepted: false,
      rejectionReason: 'Rejected: No explicit funding stated (fully funded / studentship / scholarship / stipend missing)',
      score: 0,
      matchReason: 'N/A',
    };
  }

  // 3. Eligibility Verification: International students must NOT be excluded
  const isExcluded =
    !ad.internationalAllowed ||
    textLower.includes('uk students only') ||
    textLower.includes('home students only') ||
    textLower.includes('uk/eu only') ||
    textLower.includes('not open to international students') ||
    textLower.includes('home fee status only');

  if (isExcluded) {
    return {
      accepted: false,
      rejectionReason: 'Rejected: Restricted to Home/UK applicants only; international students excluded',
      score: 0,
      matchReason: 'N/A',
    };
  }

  // 4. Relevance Scoring against Shama's 5 Papers and Themes (0 - 100)
  let score = 0;
  let matchedPaper = '';

  const amr =
    textLower.includes('antimicrobial') ||
    textLower.includes('antibiotic') ||
    textLower.includes('resistance') ||
    textLower.includes('stewardship') ||
    textLower.includes('escherichia') ||
    textLower.includes('pathogen') ||
    textLower.includes('infection') ||
    textLower.includes('carbapenem');

  const safety =
    textLower.includes('medication safety') ||
    textLower.includes('pharmacovigilance') ||
    textLower.includes('adverse drug') ||
    textLower.includes('high-alert') ||
    textLower.includes('prescribing') ||
    textLower.includes('medicines safety') ||
    textLower.includes('deprescribing');

  const clinPharm =
    textLower.includes('clinical pharmacy') ||
    textLower.includes('pharmacy practice') ||
    textLower.includes('pharmacist') ||
    textLower.includes('hospital pharmacy') ||
    textLower.includes('therapeutics');

  const aiHealth =
    textLower.includes('artificial intelligence') ||
    textLower.includes('clinical decision support') ||
    textLower.includes('machine learning') ||
    textLower.includes('digital health') ||
    textLower.includes('simulation tools');

  const implSci =
    textLower.includes('implementation science') ||
    textLower.includes('health services') ||
    textLower.includes('evidence-based');

  const cardio =
    textLower.includes('angina') ||
    textLower.includes('calcium channel') ||
    textLower.includes('beta blocker') ||
    textLower.includes('cardiovascular');

  if (amr) {
    score += 65;
    matchedPaper = 'Ali et al. (2022) hospital carbapenem antimicrobial stewardship prospective trial';
  }
  if (safety) {
    score += 65;
    if (!matchedPaper) matchedPaper = 'Baig et al. (2025) high-alert medications and medication safety assessment';
  }
  if (clinPharm) {
    score += 65;
    if (!matchedPaper) matchedPaper = 'Abidi (2026) evidence-based clinical pharmacy practice implementation';
  }
  if (aiHealth) {
    score += 60;
    if (!matchedPaper) matchedPaper = 'Baig et al. (2025) clinical pharmacist interventions vs artificial intelligence';
  }
  if (implSci) {
    score += 60;
    if (!matchedPaper) matchedPaper = 'Abidi (2026) implementation science in hospital pharmacy';
  }
  if (cardio) {
    score += 60;
    if (!matchedPaper) matchedPaper = 'Abidi et al. (2024) calcium channel blockers vs beta blockers in angina';
  }

  if (
    textLower.includes('hospital') ||
    textLower.includes('patient') ||
    textLower.includes('clinical trial') ||
    textLower.includes('healthcare') ||
    textLower.includes('health') ||
    textLower.includes('medical')
  ) {
    score += 15;
  }

  score = Math.min(100, score);

  if (score < 60) {
    return {
      accepted: false,
      rejectionReason: `Rejected: Relevance score ${score}/100 is below the 60 threshold (lacks direct clinical pharmacy/AMR/medication safety focus)`,
      score,
      matchReason: 'N/A',
    };
  }

  // 5. One-sentence Match Reason linking to Shama's specific publication
  let matchReason = '';
  if (matchedPaper.includes('Ali et al.')) {
    matchReason = `Directly connects with your published prospective interventional trial evaluating carbapenem antimicrobial stewardship at a tertiary care hospital (Ali et al., 2022).`;
  } else if (matchedPaper.includes('high-alert')) {
    matchReason = `Directly aligns with your published multi-professional research evaluating high-alert medication knowledge to prevent adverse events in hospital settings (Baig et al., 2025).`;
  } else if (matchedPaper.includes('artificial intelligence')) {
    matchReason = `Directly builds upon your published hospital trial comparing clinical pharmacist interventions with artificial intelligence decision support (Baig et al., 2025).`;
  } else if (matchedPaper.includes('calcium channel')) {
    matchReason = `Directly matches your published observational study comparing calcium channel blockers to beta blockers in angina patients (Abidi et al., 2024).`;
  } else {
    matchReason = `Strongly aligns with your MPhil research and FIP Montreal presentation on evidence-based pharmacy practice and health services implementation (Abidi, 2024 & 2026).`;
  }

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
  // If email was already present in ad on an official academic domain:
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

  const apiKey = process.env.TAVILY_API_KEY;
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
    });
    const data = await res.json();
    for (const item of data.results || []) {
      const url = item.url || '';
      const content = item.content || '';
      if (!isOfficialUniversityDomain(url)) continue;
      if (!content.toLowerCase().includes(lastName)) continue;

      const emails = content.match(EMAIL_REGEX);
      if (emails) {
        for (const e of emails) {
          const lower = e.toLowerCase();
          if (
            !lower.includes('noreply') &&
            !lower.includes('info@') &&
            !lower.includes('admin@') &&
            !lower.includes('support@') &&
            isOfficialUniversityDomain(lower)
          ) {
            return {
              email: lower,
              emailSourceUrl: url,
              verificationLevel: 'verified',
            };
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
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not configured');
  }

  const queries = [
    `site:findaphd.com/phds/project ("funded" OR "studentship") "${topic}" ${country ? `"${country}"` : ''}`,
    `site:jobs.ac.uk/job "PhD Studentship" "${topic}" ${country ? `"${country}"` : ''}`,
    `("PhD studentship" OR "fully funded PhD") "${topic}" ${country ? `"${country}"` : ''}`,
  ];

  const searchResults: Array<{ title: string; url: string; content: string }> = [];
  const seenUrls = new Set<string>();

  for (const q of queries) {
    if (searchResults.length >= limit * 2) break;
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: q,
          include_domains: FUNDED_PHD_DOMAINS,
          search_depth: 'advanced',
          max_results: Math.min(8, limit),
        }),
      });

      if (res.status === 429 || res.status === 402 || res.status === 403) {
        throw new TavilyQuotaError(`Tavily quota or rate limit exceeded (HTTP ${res.status})`);
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
      if (err instanceof TavilyQuotaError) throw err;
      console.warn(`Tavily query failed for "${q}":`, err);
    }
  }

  const accepted: EvaluatedAdResult[] = [];
  const rejected: EvaluatedAdResult[] = [];

  const candidatesToProcess = searchResults.slice(0, limit);

  for (const raw of candidatesToProcess) {
    let contentToUse = raw.content;
    if (
      (raw.url.includes('findaphd.com') ||
        raw.url.includes('jobs.ac.uk') ||
        raw.url.includes('euraxess.ec.europa.eu')) &&
      contentToUse.length < 3000
    ) {
      try {
        const extRes = await fetch('https://api.tavily.com/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: apiKey, urls: [raw.url] }),
        });
        if (extRes.ok) {
          const extData = await extRes.json();
          const full = extData.results?.[0]?.raw_content;
          if (full && full.length > contentToUse.length) contentToUse = full;
        }
      } catch {}
    }

    // Step 2: Extract text that literally appears
    const extracted = await extractLiteralAdDetails(raw.url, raw.title, contentToUse);

    // Step 3 & 4: Evaluate Funding, Eligibility, and Relevance (> 60)
    const evalRes = evaluateFundedAd(extracted);

    let verifiedEmail: string | null = null;
    let emailSourceUrl: string | null = null;
    let verificationLevel: 'verified' | 'unverified' = 'unverified';

    if (evalRes.accepted) {
      // Step 5: Supervisor Email verification (ad or official university page only)
      const emailRes = await findSupervisorOfficialEmail(
        extracted.supervisorName,
        extracted.university,
        extracted.contactEmail,
        raw.url
      );
      verifiedEmail = emailRes.email;
      emailSourceUrl = emailRes.emailSourceUrl;
      verificationLevel = emailRes.verificationLevel;

      accepted.push({
        ad: extracted,
        accepted: true,
        relevanceScore: evalRes.score,
        matchReason: evalRes.matchReason,
        verifiedEmail,
        emailSourceUrl,
        verificationLevel,
      });
    } else {
      rejected.push({
        ad: extracted,
        accepted: false,
        rejectionReason: evalRes.rejectionReason,
        relevanceScore: evalRes.score,
        matchReason: evalRes.matchReason,
        verifiedEmail: null,
        emailSourceUrl: null,
        verificationLevel: 'unverified',
      });
    }
  }

  return {
    accepted,
    rejected,
    totalSearched: candidatesToProcess.length,
  };
}

