import Groq from 'groq-sdk';
import {
  SHAMA_RESEARCH_PAPERS,
  SHAMA_RESEARCH_THEMES,
} from '../lib/types';

const UNIVERSITY_TLDS = ['.edu', '.ac.uk', '.edu.au', '.edu.ca', '.ac.nz', '.edu.sg', '.edu.cn', '.edu.hk', '.ac.za', '.ac.ie'];

export function isOfficialUniversityDomain(input: string): boolean {
  if (!input) return false;
  try {
    let hostname = '';
    if (input.includes('@')) {
      hostname = input.split('@')[1].toLowerCase().trim();
    } else {
      hostname = new URL(input.startsWith('http') ? input : `https://${input}`).hostname.toLowerCase();
    }
    if (UNIVERSITY_TLDS.some((tld) => hostname.endsWith(tld))) return true;
    if (hostname.includes('.uni-') || hostname.includes('university') || hostname.includes('.ox.ac.') || hostname.includes('.cam.ac.')) return true;
    const academicPatterns = [
      /\b(univ|ox|cam|harvard|mit|yale|stanford|imperial|ucl|kcl|ed|manchester|bristol|nottingham|bham|leeds|sheffield|tcd|ucd|toronto|ubc|mcgill|sydney|unimelb|uq|monash|ki|uu|lu|tudelft|uva|leiden|aston|strath|port|surrey|exeter|belfast|qub|hud)\b.*\.(?:ac\.[a-z]{2}|edu|se|nl|dk|no|ie|ch|de|ca|au|fr|be|it|es)$/i,
    ];
    return academicPatterns.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}

export interface ExtractedAd {
  title: string;
  adUrl: string;
  supervisorName: string;
  university: string;
  fundingType: string;
  fundingAmount: string | null;
  isExplicitlyFunded: boolean;
  isSelfFunded: boolean;
  eligibilitySnippet: string;
  internationalAllowed: boolean;
  deadline: string;
  deadlineDate: string | null;
  contactEmail: string | null;
  rawText: string;
}

export interface EvaluatedAd {
  ad: ExtractedAd;
  accepted: boolean;
  rejectionReason?: string;
  relevanceScore: number;
  matchReason: string;
  verifiedEmail: string | null;
  emailSourceUrl: string | null;
  verificationLevel: 'verified' | 'unverified';
}

export async function extractAdWithGroq(
  adUrl: string,
  title: string,
  rawContent: string
): Promise<ExtractedAd> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    throw new Error('GROQ_API_KEY is missing');
  }
  const groq = new Groq({ apiKey: groqKey });

  const prompt = `Extract ONLY text that literally appears in the PhD advertisement below. Do NOT extrapolate or guess.
Ad Title: "${title}"
Ad URL: ${adUrl}
Ad Text:
${rawContent.slice(0, 4000)}

Return strict JSON:
{
  "supervisorName": "literal supervisor name or null",
  "university": "literal university/institution name or null",
  "fundingType": "literal funding type (e.g. Fully funded, PhD studentship, EPSRC, etc) or null",
  "fundingAmount": "literal stipend or fees amount if stated, or null",
  "isExplicitlyFunded": true/false (true if stated as funded/studentship/scholarship/stipend),
  "isSelfFunded": true/false (true if stated as self-funded only or student pays fees),
  "eligibilitySnippet": "literal text regarding nationality/international eligibility or null",
  "internationalAllowed": true/false (false ONLY if explicitly restricted to Home/UK or international students excluded),
  "deadline": "literal deadline (e.g. date or 'Rolling / Open all year') or 'not_stated'",
  "deadlineDate": "YYYY-MM-DD if explicit date mentioned, or null",
  "contactEmail": "literal contact email in ad or null"
}`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a strict data extractor. Return JSON only.' },
        { role: 'user', content: prompt }
      ],
      model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
      max_tokens: 300,
      response_format: { type: 'json_object' }
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
    return {
      title,
      adUrl,
      supervisorName: parsed.supervisorName || '',
      university: parsed.university || '',
      fundingType: parsed.fundingType || '',
      fundingAmount: parsed.fundingAmount || null,
      isExplicitlyFunded: Boolean(parsed.isExplicitlyFunded),
      isSelfFunded: Boolean(parsed.isSelfFunded),
      eligibilitySnippet: parsed.eligibilitySnippet || '',
      internationalAllowed: parsed.internationalAllowed !== false,
      deadline: parsed.deadline || 'not_stated',
      deadlineDate: parsed.deadlineDate || null,
      contactEmail: parsed.contactEmail || null,
      rawText: rawContent,
    };
  } catch (err) {
    // Regex fallback
    const emailMatch = rawContent.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    const isSelfFunded = rawContent.toLowerCase().includes('self-funded');
    const isFunded = !isSelfFunded && (rawContent.toLowerCase().includes('funded') || rawContent.toLowerCase().includes('studentship'));
    const isHomeOnly = rawContent.toLowerCase().includes('uk students only') || rawContent.toLowerCase().includes('home students only');
    
    return {
      title,
      adUrl,
      supervisorName: '',
      university: '',
      fundingType: isFunded ? 'Funded PhD' : isSelfFunded ? 'Self-funded' : 'Unknown',
      fundingAmount: null,
      isExplicitlyFunded: isFunded,
      isSelfFunded: isSelfFunded,
      eligibilitySnippet: isHomeOnly ? 'Home/UK students only' : 'Open',
      internationalAllowed: !isHomeOnly,
      deadline: 'not_stated',
      deadlineDate: null,
      contactEmail: emailMatch ? emailMatch[0] : null,
      rawText: rawContent,
    };
  }
}

export function evaluateAd(ad: ExtractedAd): { accepted: boolean; rejectionReason?: string; score: number; matchReason: string } {
  const text = `${ad.title} ${ad.rawText}`.toLowerCase();

  // 1. Funding Check: Must be explicitly funded and NOT self-funded
  if (ad.isSelfFunded || text.includes('self-funded phd students only') || text.includes('self-funded only') || text.includes('this is a self-funded opportunity')) {
    return {
      accepted: false,
      rejectionReason: 'Rejected: Ad is self-funded only (no institutional or grant stipend provided)',
      score: 0,
      matchReason: 'N/A',
    };
  }

  const hasExplicitFunding =
    ad.isExplicitlyFunded ||
    text.includes('fully funded') ||
    text.includes('fully-funded') ||
    text.includes('phd studentship') ||
    text.includes('studentship funded by') ||
    text.includes('funded phd') ||
    text.includes('scholarship') ||
    text.includes('stipend');

  if (!hasExplicitFunding) {
    return {
      accepted: false,
      rejectionReason: 'Rejected: No explicit funding stated (fully funded / studentship / scholarship / stipend missing)',
      score: 0,
      matchReason: 'N/A',
    };
  }

  // 2. Eligibility Check: International students must NOT be excluded
  if (!ad.internationalAllowed || text.includes('uk students only') || text.includes('home students only') || text.includes('not open to international students') || text.includes('home fee status only')) {
    return {
      accepted: false,
      rejectionReason: 'Rejected: Restricted to Home/UK applicants only; international students excluded',
      score: 0,
      matchReason: 'N/A',
    };
  }

  // 3. Relevance Scoring against Shama's 5 Papers and Core Themes (0 - 100)
  let score = 0;
  let matchedPaper = '';

  const amr = text.includes('antimicrobial') || text.includes('antibiotic') || text.includes('resistance') || text.includes('stewardship') || text.includes('escherichia') || text.includes('pathogen') || text.includes('infection');
  const safety = text.includes('medication safety') || text.includes('pharmacovigilance') || text.includes('adverse drug') || text.includes('high-alert') || text.includes('prescribing') || text.includes('medicines safety');
  const clinPharm = text.includes('clinical pharmacy') || text.includes('pharmacy practice') || text.includes('pharmacist') || text.includes('hospital pharmacy') || text.includes('therapeutics');
  const aiHealth = text.includes('artificial intelligence') || text.includes('clinical decision support') || text.includes('machine learning') || text.includes('digital health');
  const implSci = text.includes('implementation science') || text.includes('health services') || text.includes('evidence-based');
  const cardio = text.includes('angina') || text.includes('calcium channel') || text.includes('beta blocker') || text.includes('cardiovascular');

  if (amr) {
    score += 45;
    matchedPaper = 'Ali et al. (2022) hospital carbapenem antimicrobial stewardship prospective trial';
  }
  if (safety) {
    score += 45;
    if (!matchedPaper) matchedPaper = 'Baig et al. (2025) high-alert medications and medication safety assessment';
  }
  if (clinPharm) {
    score += 35;
    if (!matchedPaper) matchedPaper = 'Abidi (2026) evidence-based clinical pharmacy practice implementation';
  }
  if (aiHealth) {
    score += 35;
    if (!matchedPaper) matchedPaper = 'Baig et al. (2025) clinical pharmacist interventions vs artificial intelligence';
  }
  if (implSci) {
    score += 30;
    if (!matchedPaper) matchedPaper = 'Abidi (2026) implementation science in hospital pharmacy';
  }
  if (cardio) {
    score += 40;
    if (!matchedPaper) matchedPaper = 'Abidi et al. (2024) calcium channel blockers vs beta blockers in angina';
  }

  if (text.includes('hospital') || text.includes('patient') || text.includes('clinical trial') || text.includes('healthcare')) {
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

  // 4. One-sentence Match Reason linking to Shama's specific publication
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

export async function findSupervisorEmail(
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

      const emails = content.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
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
