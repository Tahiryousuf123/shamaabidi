import { DiscoveryQuery, DiscoveryCandidate, DiscoverySourceModule } from '../types';
import { SOURCES_CONFIG, getDateWindow } from '../config';
import { resilientFetchJson } from '../http';

interface NihPi {
  profile_id?: number;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  full_name?: string;
  is_contact_pi?: boolean;
}

interface NihProject {
  project_num?: string;
  project_title?: string;
  org_name?: string;
  org_country?: string;
  principal_investigators?: NihPi[];
  project_detail_url?: string;
  is_active?: boolean;
  fiscal_year?: number;
}

interface NihResponse {
  results?: NihProject[];
  total?: number;
}

export const nihReporterSource: DiscoverySourceModule = {
  name: 'NIH RePORTER v2',
  config: SOURCES_CONFIG.nihreporter,
  search: async ({ topic, dateFrom, regions, limit = 20 }: DiscoveryQuery): Promise<DiscoveryCandidate[]> => {
    if (!nihReporterSource.config.enabled) return [];

    // Only include if US / North America is enabled in regions config or explicitly passed
    const includeUS = regions
      ? regions.some((r) => /^(united states|usa|us|north america)$/i.test(r.trim()))
      : true; // Enabled by default as collaborator/PhD-hosting PIs per prompt

    if (!includeUS) return [];

    const dateWin = getDateWindow(3);
    const currentYear = dateWin.toYear;
    const fiscalYears = [currentYear, currentYear - 1, currentYear - 2];

    const body = {
      criteria: {
        advanced_text_search: {
          operator: 'and',
          search_field: 'all',
          search_text: topic,
        },
        is_active: true,
        fiscal_years: fiscalYears,
      },
      limit: Math.min(limit * 2, 40),
      offset: 0,
    };

    const url = 'https://api.reporter.nih.gov/v2/projects/search';

    const res = await resilientFetchJson<NihResponse>(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
      delayMs: nihReporterSource.config.delayMs,
    });

    const projects = res.data?.results || [];
    const candidates: DiscoveryCandidate[] = [];

    for (const proj of projects) {
      const pNum = proj.project_num || '';
      const title = proj.project_title || 'NIH Research Grant';
      const orgName = proj.org_name || 'US Academic Institution';
      const orgCountry = proj.org_country || 'United States';
      const pis = proj.principal_investigators || [];
      if (pis.length === 0) continue;

      const contactPi = pis.find((p) => p.is_contact_pi) || pis[0];
      const fullName = contactPi.full_name || `${contactPi.first_name || ''} ${contactPi.last_name || ''}`.trim();
      if (!fullName) continue;

      const cleanName = fullName.replace(/\s+/g, ' ').replace(/^Dr\.\s*|^Prof\.\s*/i, '').trim();
      const sourceUrl = proj.project_detail_url || (pNum ? `https://reporter.nih.gov/project-details/${encodeURIComponent(pNum)}` : 'https://reporter.nih.gov/');

      candidates.push({
        name: cleanName,
        institution: orgName,
        country: orgCountry,
        orcid: null,
        openalexId: null,
        email: null,
        emailSourceUrl: null,
        sourceName: nihReporterSource.name,
        sourceUrl,
        evidence: {
          grantId: pNum,
          grantTitle: title,
          grantStatus: 'active',
          fundingBody: 'NIH (National Institutes of Health)',
          paperTitle: `NIH Grant: ${title}`,
          year: proj.fiscal_year || currentYear,
        },
      });

      if (candidates.length >= limit) break;
    }

    return candidates;
  },
};
