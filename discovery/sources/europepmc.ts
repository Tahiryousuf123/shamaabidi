import { DiscoveryQuery, DiscoveryCandidate, DiscoverySourceModule } from '../types';
import { SOURCES_CONFIG, getDateWindow, isTargetRegion } from '../config';
import { resilientFetchJson } from '../http';

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

interface EuropePmcAuthor {
  fullName?: string;
  lastName?: string;
  firstName?: string;
  authorId?: { type: string; value: string };
  authorAffiliationDetailsList?: {
    authorAffiliation?: Array<{ affiliation: string }>;
  };
}

interface EuropePmcResult {
  id?: string;
  source?: string;
  doi?: string;
  title?: string;
  pubYear?: string;
  firstPublicationDate?: string;
  authorList?: {
    author?: EuropePmcAuthor[];
  };
}

interface EuropePmcResponse {
  resultList?: {
    result?: EuropePmcResult[];
  };
}

export const europePmcSource: DiscoverySourceModule = {
  name: 'Europe PMC REST',
  config: SOURCES_CONFIG.europepmc,
  search: async ({ topic, dateFrom, regions, limit = 25 }: DiscoveryQuery): Promise<DiscoveryCandidate[]> => {
    if (!europePmcSource.config.enabled) return [];

    const dateWin = getDateWindow(3);
    const fromStr = dateFrom ? `${dateFrom}-01-01` : dateWin.fromDate;
    const toStr = dateWin.toDate;

    // Search peer-reviewed and preprints (PPR)
    const query = `(${topic}) AND FIRST_PDATE:[${fromStr} TO ${toStr}]`;
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&resultType=core&format=json&pageSize=${Math.min(limit * 2, 50)}`;

    const res = await resilientFetchJson<EuropePmcResponse>(url, {
      delayMs: europePmcSource.config.delayMs,
    });

    const articles = res.data?.resultList?.result || [];
    const candidates: DiscoveryCandidate[] = [];

    for (const art of articles) {
      const title = art.title?.replace(/<[^>]+>/g, '').trim() || 'Research Publication';
      const year = art.pubYear ? parseInt(art.pubYear, 10) : dateWin.toYear;
      const doi = art.doi;
      const authors = art.authorList?.author || [];
      if (authors.length === 0) continue;

      // Extract details for all authors
      const parsed = authors.map((a) => {
        const name = a.fullName || `${a.firstName || ''} ${a.lastName || ''}`.trim();
        const orcid = a.authorId?.type?.toUpperCase() === 'ORCID' ? a.authorId.value : null;
        const affs = a.authorAffiliationDetailsList?.authorAffiliation?.map((x) => x.affiliation) || [];
        const affText = affs.join('; ');

        let email: string | null = null;
        const em = affText.match(EMAIL_REGEX);
        if (em) {
          email = em[0].toLowerCase().trim().replace(/[.,;)]+$/, '');
        }

        return { name, orcid, affiliation: affText, email };
      }).filter((a) => a.name.length > 0);

      if (parsed.length === 0) continue;

      // Pick corresponding (with email) and last author
      const withEmail = parsed.find((a) => a.email !== null);
      const last = parsed[parsed.length - 1];

      const targets = [withEmail, last].filter(Boolean) as typeof parsed;
      const seen = new Set<string>();

      for (const target of targets) {
        if (seen.has(target.name)) continue;
        seen.add(target.name);

        if (target.affiliation && !isTargetRegion(target.affiliation, false)) {
          continue;
        }

        const institution = target.affiliation
          ? target.affiliation.split(',')[0].trim()
          : 'European Academic Institution';

        const sourceUrl = art.id && art.source
          ? `https://europepmc.org/article/${art.source}/${art.id}`
          : (doi ? `https://doi.org/${doi}` : 'https://europepmc.org/');

        candidates.push({
          name: target.name,
          institution,
          country: target.affiliation.split(',').pop()?.trim() || 'Europe / Global',
          orcid: target.orcid,
          openalexId: null,
          email: target.email,
          emailSourceUrl: target.email ? sourceUrl : null,
          sourceName: europePmcSource.name,
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
  },
};
