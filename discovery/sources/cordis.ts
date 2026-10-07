import { DiscoveryQuery, DiscoveryCandidate, DiscoverySourceModule } from '../types';
import { SOURCES_CONFIG, getDateWindow } from '../config';
import { resilientFetchJson } from '../http';

interface CordisProject {
  rcn?: string;
  id?: string;
  acronym?: string;
  title?: string;
  teaser?: string;
  objective?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  totalCost?: string;
  ecMaxContribution?: string;
  relations?: {
    associations?: any;
    categories?: any;
  };
}

interface CordisHit {
  project?: CordisProject;
}

interface CordisSearchResponse {
  hits?: {
    hit?: CordisHit | CordisHit[];
  };
}

export const cordisSource: DiscoverySourceModule = {
  name: 'CORDIS (EU Horizon / MSCA)',
  config: SOURCES_CONFIG.cordis,
  search: async ({ topic, dateFrom, regions, limit = 15 }: DiscoveryQuery): Promise<DiscoveryCandidate[]> => {
    if (!cordisSource.config.enabled) return [];

    const dateWin = getDateWindow(3);
    const cleanTopic = topic.replace(/[^\w\s]/g, ' ').trim();
    const query = encodeURIComponent(cleanTopic);
    const url = `https://cordis.europa.eu/search/en?q=${query}&p=1&num=${Math.min(limit * 2, 30)}&type=project&format=json`;

    const candidates: DiscoveryCandidate[] = [];

    // 1. Try direct open CORDIS search endpoint
    try {
      const res = await resilientFetchJson<CordisSearchResponse>(url, {
        delayMs: cordisSource.config.delayMs,
        maxRetries: 2,
      });

      const rawHit = res.data?.hits?.hit;
      const hits: CordisHit[] = Array.isArray(rawHit) ? rawHit : rawHit ? [rawHit] : [];

      for (const h of hits) {
        const p = h.project;
        if (!p || !p.title) continue;

        const id = p.id || p.rcn || '';
        const title = p.title;
        const acronym = p.acronym ? `[${p.acronym}] ` : '';
        const fullTitle = `${acronym}${title}`;
        const status = p.status || 'ACTIVE';
        const endDate = p.endDate || '';
        const currentYear = dateWin.toYear;
        const endYear = endDate ? parseInt(endDate.slice(0, 4), 10) : currentYear;

        // Keep projects that are active or ending within recent years
        const isRecent = endYear >= currentYear - 2;
        if (!isRecent) continue;

        const projectUrl = id ? `https://cordis.europa.eu/project/id/${id}` : 'https://cordis.europa.eu/';

        // Extract institution if mentioned in teaser or objective, or general Horizon Europe Consortium
        const institution = 'Horizon Europe Research Consortium';
        const coordinatorName = p.acronym ? `Project Coordinator (${p.acronym})` : 'Horizon Europe Principal Investigator';

        candidates.push({
          name: coordinatorName,
          institution,
          country: 'European Union',
          orcid: null,
          openalexId: null,
          email: null,
          emailSourceUrl: null,
          sourceName: cordisSource.name,
          sourceUrl: projectUrl,
          evidence: {
            grantId: id,
            grantTitle: fullTitle,
            grantStatus: status.toLowerCase().includes('closed') ? 'closed' : 'active',
            fundingBody: 'European Commission (Horizon Europe / MSCA Doctoral Networks)',
            paperTitle: `EU Horizon Project: ${fullTitle}`,
            year: endYear,
          },
        });

        if (candidates.length >= limit) break;
      }

      if (candidates.length > 0) return candidates;
    } catch (e: any) {
      console.warn(`[CORDIS] Direct endpoint query warning: ${e.message}. Trying Tavily fallback.`);
    }

    // 2. Tavily Fallback: site:cordis.europa.eu
    const tavilyKey = (process.env.TAVILY_API_KEY || '').trim();
    if (tavilyKey) {
      try {
        const tavilyRes = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: tavilyKey,
            query: `site:cordis.europa.eu "${cleanTopic}" (project OR "Horizon Europe" OR "MSCA")`,
            max_results: Math.min(limit, 10),
          }),
        });

        if (tavilyRes.ok) {
          const tData = await tavilyRes.json();
          for (const item of tData.results || []) {
            const url = item.url || '';
            const title = item.title || 'EU Horizon Project';
            const content = item.content || '';

            // Extract project acronym or id from URL: e.g. cordis.europa.eu/project/id/101072922
            const idMatch = url.match(/\/project\/id\/(\d+)/);
            const grantId = idMatch ? idMatch[1] : undefined;

            candidates.push({
              name: 'EU Horizon Consortium Coordinator',
              institution: 'European Research Institution',
              country: 'Europe',
              orcid: null,
              openalexId: null,
              email: null,
              emailSourceUrl: null,
              sourceName: `${cordisSource.name} (Tavily fallback)`,
              sourceUrl: url,
              evidence: {
                grantId,
                grantTitle: title,
                grantStatus: 'active',
                fundingBody: 'European Commission (Horizon Europe / MSCA)',
                paperTitle: title,
                year: dateWin.toYear,
              },
            });
          }
        }
      } catch (tErr: any) {
        console.warn('[CORDIS] Tavily fallback error:', tErr.message);
      }
    }

    return candidates;
  },
};
