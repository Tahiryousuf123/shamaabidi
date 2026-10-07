import { CONTACT_EMAIL, USER_AGENT } from './config';
import { resilientFetchJson } from './http';
import { isOfficialUniversityDomain, isAcceptableProfessorEmail } from '@/lib/auto-find';

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

export interface ResolvedAuthor {
  openalexId: string | null;
  orcid: string | null;
  displayName: string;
  matchedInstitution: string;
  hasRecentMatchingPaper: boolean;
  matchingPaperTitle?: string;
  matchingPaperYear?: number;
}

export async function resolveOpenAlexAuthor(
  name: string,
  institution: string,
  providedOrcid?: string | null,
  topic = ''
): Promise<ResolvedAuthor | null> {
  const currentYear = new Date().getFullYear();
  const threeYearsAgo = currentYear - 3;
  const cleanName = name.replace(/^Dr\.\s*|^Prof\.\s*/i, '').trim();

  // 1. Resolve by ORCID first if present
  if (providedOrcid) {
    const cleanOrcid = providedOrcid.replace(/^(https?:\/\/)?orcid\.org\//, '').trim();
    const orcidUrl = `https://api.openalex.org/authors?filter=orcid:${encodeURIComponent(cleanOrcid)}&mailto=${encodeURIComponent(CONTACT_EMAIL)}`;

    try {
      const res = await resilientFetchJson<any>(orcidUrl, { delayMs: 150 });
      const author = res.data?.results?.[0];
      if (author && author.id) {
        // Fetch recent works to verify at least 1 matching paper in last 3 years
        const worksUrl = `https://api.openalex.org/works?filter=author.id:${author.id.replace('https://openalex.org/', '')},publication_year:>${threeYearsAgo}&sort=publication_date:desc&per-page=5&mailto=${encodeURIComponent(CONTACT_EMAIL)}`;
        const worksRes = await resilientFetchJson<any>(worksUrl, { delayMs: 100 });
        const works = worksRes.data?.results || [];

        const matchingWork = works.find((w: any) => {
          const t = (w.title || '').toLowerCase();
          return topic ? t.includes(topic.toLowerCase().split(' ')[0]) : true;
        }) || works[0];

        return {
          openalexId: author.id,
          orcid: cleanOrcid,
          displayName: author.display_name || cleanName,
          matchedInstitution: author.last_known_institutions?.[0]?.display_name || institution,
          hasRecentMatchingPaper: works.length > 0,
          matchingPaperTitle: matchingWork?.title,
          matchingPaperYear: matchingWork?.publication_year,
        };
      }
    } catch (e) {
      console.warn(`[OpenAlex] Error resolving ORCID ${cleanOrcid}:`, e);
    }
  }

  // 2. Resolve by Name + Institution search
  if (!cleanName || cleanName.split(' ').length < 2) return null;

  const searchUrl = `https://api.openalex.org/authors?search=${encodeURIComponent(cleanName)}&mailto=${encodeURIComponent(CONTACT_EMAIL)}`;

  try {
    const res = await resilientFetchJson<any>(searchUrl, { delayMs: 200 });
    const results = res.data?.results || [];
    if (results.length === 0) return null;

    // Normalize institution words for matching
    const instWords = institution
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !['university', 'college', 'hospital', 'school', 'faculty', 'department'].includes(w));

    const matches: any[] = [];

    for (const r of results) {
      const authorInsts = (r.last_known_institutions || []).map((i: any) => (i.display_name || '').toLowerCase());
      const instCombined = authorInsts.join(' ');

      // Check if any significant institution keyword matches
      const hasMatch = instWords.some((w) => instCombined.includes(w));
      if (hasMatch) {
        matches.push(r);
      }
    }

    // Reject ambiguous matches
    if (matches.length === 0) {
      // Fallback: If only 1 result returned overall and name is identical
      if (results.length === 1 && results[0].display_name?.toLowerCase() === cleanName.toLowerCase()) {
        matches.push(results[0]);
      } else {
        return null;
      }
    }

    if (matches.length > 2) {
      // Too ambiguous
      return null;
    }

    const best = matches[0];
    const cleanOrcid = best.orcid ? best.orcid.replace(/^(https?:\/\/)?orcid\.org\//, '').trim() : null;

    // Check recent works in last 3 years
    const worksUrl = `https://api.openalex.org/works?filter=author.id:${best.id.replace('https://openalex.org/', '')},publication_year:>${threeYearsAgo}&sort=publication_date:desc&per-page=5&mailto=${encodeURIComponent(CONTACT_EMAIL)}`;
    const worksRes = await resilientFetchJson<any>(worksUrl, { delayMs: 100 });
    const works = worksRes.data?.results || [];

    const matchingWork = works.find((w: any) => {
      const t = (w.title || '').toLowerCase();
      return topic ? t.includes(topic.toLowerCase().split(' ')[0]) : true;
    }) || works[0];

    return {
      openalexId: best.id,
      orcid: cleanOrcid,
      displayName: best.display_name || cleanName,
      matchedInstitution: best.last_known_institutions?.[0]?.display_name || institution,
      hasRecentMatchingPaper: works.length > 0,
      matchingPaperTitle: matchingWork?.title,
      matchingPaperYear: matchingWork?.publication_year,
    };
  } catch (e) {
    console.warn(`[OpenAlex] Search error for ${cleanName}:`, e);
    return null;
  }
}

export async function verifyFacultyPageAndEmail(
  name: string,
  university: string,
  candidateEmail?: string | null,
  sourceUrl?: string | null
): Promise<{
  verifiedEmail: string | null;
  emailSourceUrl: string | null;
  profileSourceUrl: string | null;
  verificationLevel: 'verified' | 'partial' | 'unverified';
}> {
  // If candidate already has an email and sourceUrl
  if (candidateEmail && sourceUrl) {
    const isOfficial = isOfficialUniversityDomain(sourceUrl) || isOfficialUniversityDomain(candidateEmail);
    return {
      verifiedEmail: candidateEmail,
      emailSourceUrl: sourceUrl,
      profileSourceUrl: sourceUrl,
      verificationLevel: isOfficial ? 'verified' : 'partial',
    };
  }

  // Fetch official faculty page via Tavily or direct university search if available
  const apiKey = (process.env.TAVILY_API_KEY || '').trim();
  if (!apiKey) {
    return {
      verifiedEmail: null,
      emailSourceUrl: null,
      profileSourceUrl: sourceUrl || null,
      verificationLevel: 'unverified',
    };
  }

  const cleanName = name.replace(/^Dr\.\s*|^Prof\.\s*/i, '').trim();
  const lastName = cleanName.split(' ').slice(-1)[0].toLowerCase();
  const query = `"${cleanName}" "${university}" (faculty OR profile OR contact OR staff)`;

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

    if (!res.ok) {
      return {
        verifiedEmail: null,
        emailSourceUrl: null,
        profileSourceUrl: sourceUrl || null,
        verificationLevel: 'unverified',
      };
    }

    const data = await res.json();
    const results: Array<{ url?: string; content?: string }> = data.results || [];

    let verifiedEmail: string | null = null;
    let emailSourceUrl: string | null = null;
    let profileSourceUrl: string | null = null;
    let isOfficialDomain = false;
    let nameMatches = false;

    for (const item of results) {
      const url = item.url || '';
      const content = item.content || '';
      const isOfficial = isOfficialUniversityDomain(url);

      if (!profileSourceUrl && (isOfficial || url.includes('staff') || url.includes('faculty') || url.includes('people'))) {
        profileSourceUrl = url;
      }

      const emailMatches = content.match(EMAIL_REGEX);
      if (emailMatches && !verifiedEmail) {
        for (const raw of emailMatches) {
          const em = raw.toLowerCase().trim().replace(/[.,;)]+$/, '');
          const isGeneric =
            em.includes('noreply') ||
            em.includes('no-reply') ||
            em.includes('support@') ||
            em.includes('info@') ||
            em.includes('admin@') ||
            em.includes('help@');

          if (!isGeneric) {
            verifiedEmail = em;
            emailSourceUrl = url;
            isOfficialDomain = isOfficial;
            if (content.toLowerCase().includes(lastName)) {
              nameMatches = true;
            }
            break;
          }
        }
      }
    }

    const verificationLevel: 'verified' | 'partial' | 'unverified' =
      verifiedEmail && (isOfficialDomain || isAcceptableProfessorEmail(verifiedEmail))
        ? 'verified'
        : verifiedEmail
        ? 'partial'
        : 'unverified';

    return {
      verifiedEmail,
      emailSourceUrl,
      profileSourceUrl: profileSourceUrl || sourceUrl || null,
      verificationLevel,
    };
  } catch (e) {
    return {
      verifiedEmail: null,
      emailSourceUrl: null,
      profileSourceUrl: sourceUrl || null,
      verificationLevel: 'unverified',
    };
  }
}
