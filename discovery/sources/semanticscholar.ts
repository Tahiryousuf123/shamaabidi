import { DiscoveryQuery, DiscoveryCandidate, DiscoverySourceModule } from '../types';
import { SOURCES_CONFIG, getDateWindow, isTargetRegion } from '../config';
import { resilientFetchJson } from '../http';

interface S2Author {
  authorId?: string;
  name?: string;
  affiliations?: string[];
  externalIds?: {
    ORCID?: string;
  };
}

interface S2Paper {
  paperId?: string;
  title?: string;
  year?: number;
  venue?: string;
  externalIds?: {
    DOI?: string;
    PubMed?: string;
    CorpusId?: number;
  };
  authors?: S2Author[];
}

interface S2SearchResponse {
  total?: number;
  data?: S2Paper[];
}

export const semanticScholarSource: DiscoverySourceModule = {
  name: 'Semantic Scholar Graph API',
  config: SOURCES_CONFIG.semanticscholar,
  search: async ({ topic, dateFrom, regions, limit = 20 }: DiscoveryQuery): Promise<DiscoveryCandidate[]> => {
    if (!semanticScholarSource.config.enabled) return [];

    const apiKey = (process.env.S2_API_KEY || '').trim();
    const dateWin = getDateWindow(3);
    const fromYear = dateFrom ? dateFrom.slice(0, 4) : String(dateWin.fromYear);

    const query = encodeURIComponent(topic);
    const fields = 'title,year,externalIds,authors.name,authors.affiliations,authors.externalIds,venue';
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${query}&year=${fromYear}-&fields=${fields}&limit=${Math.min(limit * 2, 30)}`;

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    try {
      const res = await resilientFetchJson<S2SearchResponse>(url, {
        headers,
        delayMs: semanticScholarSource.config.delayMs,
        maxRetries: 2,
      });

      const papers = res.data?.data || [];
      const candidates: DiscoveryCandidate[] = [];

      for (const p of papers) {
        const title = p.title || 'Scholarly Paper';
        const year = p.year || dateWin.toYear;
        const doi = p.externalIds?.DOI;
        const authors = p.authors || [];
        if (authors.length === 0) continue;

        // Choose last author and authors with affiliations
        const validAuthors = authors.filter((a) => a.name && a.name.trim().length > 0);
        if (validAuthors.length === 0) continue;

        const lastAuthor = validAuthors[validAuthors.length - 1];
        const withAff = validAuthors.find((a) => a.affiliations && a.affiliations.length > 0);

        const targets = [lastAuthor, withAff].filter(Boolean) as S2Author[];
        const seen = new Set<string>();

        for (const author of targets) {
          if (!author.name || seen.has(author.name)) continue;
          seen.add(author.name);

          const affiliation = author.affiliations?.[0] || '';
          if (affiliation && !isTargetRegion(affiliation, false)) {
            continue;
          }

          const orcid = author.externalIds?.ORCID || null;
          const institution = affiliation
            ? affiliation.split(',')[0].trim()
            : 'Academic Department / Research Institute';

          const sourceUrl = p.paperId
            ? `https://www.semanticscholar.org/paper/${p.paperId}`
            : (doi ? `https://doi.org/${doi}` : 'https://www.semanticscholar.org/');

          candidates.push({
            name: author.name,
            institution,
            country: affiliation.split(',').pop()?.trim() || 'Global',
            orcid,
            openalexId: null,
            email: null, // S2 graph API does not provide emails; verified at Stage 3
            emailSourceUrl: null,
            sourceName: semanticScholarSource.name,
            sourceUrl,
            evidence: {
              paperTitle: title,
              doi,
              year,
            },
          });
        }
      }

      return candidates;
    } catch (err: any) {
      // Catch failure gracefully and never abort the pipeline
      console.warn(`[Semantic Scholar] Non-fatal query error: ${err.message}`);
      return [];
    }
  },
};
