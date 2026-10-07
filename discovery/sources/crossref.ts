import { DiscoveryQuery, DiscoveryCandidate, DiscoverySourceModule } from '../types';
import { SOURCES_CONFIG, CONTACT_EMAIL, getDateWindow, isTargetRegion } from '../config';
import { resilientFetchJson } from '../http';

interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
  sequence?: 'first' | 'additional';
  ORCID?: string;
  affiliation?: Array<{ name?: string }>;
}

interface CrossrefWork {
  DOI?: string;
  title?: string[];
  issued?: {
    'date-parts'?: number[][];
  };
  author?: CrossrefAuthor[];
  'container-title'?: string[];
}

interface CrossrefResponse {
  message?: {
    total_results?: number;
    items?: CrossrefWork[];
  };
}

export const crossrefSource: DiscoverySourceModule = {
  name: 'Crossref',
  config: SOURCES_CONFIG.crossref,
  search: async ({ topic, dateFrom, regions, limit = 25 }: DiscoveryQuery): Promise<DiscoveryCandidate[]> => {
    if (!crossrefSource.config.enabled) return [];

    const dateWin = getDateWindow(3);
    const fromDate = dateFrom ? `${dateFrom}-01-01` : dateWin.fromDate;

    const params = new URLSearchParams({
      'query.bibliographic': topic,
      filter: `from-pub-date:${fromDate},type:journal-article`,
      select: 'DOI,title,author,issued,container-title',
      rows: String(Math.min(limit * 2, 50)),
      mailto: CONTACT_EMAIL,
    });

    const url = `https://api.crossref.org/works?${params.toString()}`;

    const res = await resilientFetchJson<CrossrefResponse>(url, {
      delayMs: crossrefSource.config.delayMs,
    });

    const works = res.data?.message?.items || [];
    const candidates: DiscoveryCandidate[] = [];

    for (const work of works) {
      const title = work.title?.[0] || 'Journal Article';
      const doi = work.DOI;
      const year = work.issued?.['date-parts']?.[0]?.[0] || dateWin.toYear;
      const authors = work.author || [];
      if (authors.length === 0) continue;

      // Extract authors with ORCID or last author
      const parsed = authors.map((a) => {
        const fullName = a.name || `${a.given || ''} ${a.family || ''}`.trim();
        const orcid = a.ORCID ? a.ORCID.replace(/^(https?:\/\/)?orcid\.org\//, '').trim() : null;
        const affNames = (a.affiliation || []).map((aff) => aff.name || '').filter(Boolean);
        const affText = affNames.join('; ');
        return { name: fullName, orcid, affiliation: affText, sequence: a.sequence };
      }).filter((a) => a.name.length > 0);

      if (parsed.length === 0) continue;

      // Prefer authors with ORCID or last author
      const withOrcid = parsed.filter((a) => a.orcid !== null);
      const last = parsed[parsed.length - 1];

      const targets = withOrcid.length > 0 ? withOrcid : [last];
      const seen = new Set<string>();

      for (const target of targets) {
        if (seen.has(target.name)) continue;
        seen.add(target.name);

        if (target.affiliation && !isTargetRegion(target.affiliation, false)) {
          continue;
        }

        const institution = target.affiliation
          ? target.affiliation.split(',')[0].trim()
          : 'Academic University / Medical Centre';

        const sourceUrl = doi ? `https://doi.org/${doi}` : 'https://api.crossref.org/';

        candidates.push({
          name: target.name,
          institution,
          country: target.affiliation.split(',').pop()?.trim() || 'Global Target Region',
          orcid: target.orcid,
          openalexId: null,
          email: null,
          emailSourceUrl: null,
          sourceName: crossrefSource.name,
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
