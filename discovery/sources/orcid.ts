import { DiscoveryQuery, DiscoveryCandidate, DiscoverySourceModule } from '../types';
import { SOURCES_CONFIG, getDateWindow, isTargetRegion } from '../config';
import { resilientFetchJson } from '../http';

interface OrcidExpandedItem {
  'orcid-id'?: string;
  'given-names'?: string;
  'family-names'?: string;
  'credit-name'?: string;
  'other-name'?: string[];
  'institution-name'?: string[];
}

interface OrcidExpandedSearchResponse {
  'expanded-result'?: OrcidExpandedItem[];
  'num-found'?: number;
}

interface OrcidEmploymentSummary {
  'department-name'?: string;
  'role-title'?: string;
  'start-date'?: { year?: { value?: string } };
  'end-date'?: { year?: { value?: string } | null };
  organization?: {
    name?: string;
    address?: {
      city?: string;
      region?: string;
      country?: string;
    };
  };
}

interface OrcidEmploymentsResponse {
  'affiliation-group'?: Array<{
    summaries?: Array<{
      'employment-summary'?: OrcidEmploymentSummary;
    }>;
  }>;
}

interface OrcidWorksResponse {
  group?: Array<{
    'work-summary'?: Array<{
      title?: {
        title?: { value?: string };
      };
      'publication-date'?: {
        year?: { value?: string };
      };
      'external-ids'?: {
        'external-id'?: Array<{
          'external-id-type'?: string;
          'external-id-value'?: string;
        }>;
      };
    }>;
  }>;
}

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getOrcidAuthHeader(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const clientId = (process.env.ORCID_CLIENT_ID || '').trim();
  const clientSecret = (process.env.ORCID_CLIENT_SECRET || '').trim();

  if (clientId && clientSecret) {
    if (cachedAccessToken && Date.now() < tokenExpiresAt) {
      headers['Authorization'] = `Bearer ${cachedAccessToken}`;
      return headers;
    }

    try {
      const tokenRes = await fetch('https://orcid.org/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'client_credentials',
          scope: '/read-public',
        }),
      });

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        cachedAccessToken = tokenData.access_token;
        tokenExpiresAt = Date.now() + (tokenData.expires_in || 3600) * 1000 - 60000;
        headers['Authorization'] = `Bearer ${cachedAccessToken}`;
      }
    } catch (e) {
      console.warn('[ORCID] Could not obtain client-credentials token, trying public API:', e);
    }
  }

  return headers;
}

export const orcidSource: DiscoverySourceModule = {
  name: 'ORCID Public API',
  config: SOURCES_CONFIG.orcid,
  search: async ({ topic, dateFrom, regions, limit = 15 }: DiscoveryQuery): Promise<DiscoveryCandidate[]> => {
    if (!orcidSource.config.enabled) return [];

    const headers = await getOrcidAuthHeader();
    const cleanTopic = topic.replace(/[^\w\s]/g, ' ').trim();
    const query = encodeURIComponent(`"${cleanTopic}"`);
    const searchUrl = `https://pub.orcid.org/v3.0/expanded-search/?q=${query}&rows=${Math.min(limit * 2, 30)}`;

    try {
      const searchRes = await resilientFetchJson<OrcidExpandedSearchResponse>(searchUrl, {
        headers,
        delayMs: orcidSource.config.delayMs,
      });

      const items = searchRes.data?.['expanded-result'] || [];
      const candidates: DiscoveryCandidate[] = [];

      for (const item of items.slice(0, limit)) {
        const orcidId = item['orcid-id'];
        if (!orcidId) continue;

        const given = item['given-names'] || '';
        const family = item['family-names'] || '';
        const name = (item['credit-name'] || `${given} ${family}`).trim();
        if (!name) continue;

        // Fetch employments to verify current institution & role
        let currentInst = item['institution-name']?.[0] || '';
        let currentCountry = 'Target Region';
        let roleTitle = 'Professor / Academic Researcher';

        try {
          const empUrl = `https://pub.orcid.org/v3.0/${orcidId}/employments`;
          const empRes = await resilientFetchJson<OrcidEmploymentsResponse>(empUrl, {
            headers,
            delayMs: 150,
          });

          const groups = empRes.data?.['affiliation-group'] || [];
          for (const g of groups) {
            for (const s of g.summaries || []) {
              const emp = s['employment-summary'];
              if (emp) {
                // If end date is null, this is their active current employment
                const isCurrent = !emp['end-date'] || !emp['end-date'].year;
                if (isCurrent && emp.organization?.name) {
                  currentInst = emp.organization.name;
                  currentCountry = emp.organization.address?.country || currentCountry;
                  roleTitle = emp['role-title'] || roleTitle;
                  break;
                } else if (!currentInst && emp.organization?.name) {
                  currentInst = emp.organization.name;
                  currentCountry = emp.organization.address?.country || currentCountry;
                  roleTitle = emp['role-title'] || roleTitle;
                }
              }
            }
            if (currentInst) break;
          }
        } catch {}

        if (!currentInst) currentInst = 'University / Research Institute';

        // Filter out non-target regions
        if (currentCountry && !isTargetRegion(currentCountry, false)) {
          continue;
        }

        // Fetch works to get at least 1 recent matching paper
        let recentPaperTitle: string | undefined;
        let recentPaperYear: number | undefined;
        let recentPaperDoi: string | undefined;

        try {
          const worksUrl = `https://pub.orcid.org/v3.0/${orcidId}/works`;
          const worksRes = await resilientFetchJson<OrcidWorksResponse>(worksUrl, {
            headers,
            delayMs: 150,
          });

          const workGroups = worksRes.data?.group || [];
          for (const wg of workGroups) {
            const summary = wg['work-summary']?.[0];
            if (summary?.title?.title?.value) {
              recentPaperTitle = summary.title.title.value;
              const yVal = summary['publication-date']?.year?.value;
              if (yVal) recentPaperYear = parseInt(yVal, 10);
              const extIds = summary['external-ids']?.['external-id'] || [];
              const doiId = extIds.find((x) => x['external-id-type']?.toLowerCase() === 'doi');
              if (doiId?.['external-id-value']) {
                recentPaperDoi = doiId['external-id-value'];
              }
              break;
            }
          }
        } catch {}

        candidates.push({
          name,
          institution: currentInst,
          country: currentCountry,
          orcid: orcidId,
          openalexId: null,
          email: null,
          emailSourceUrl: null,
          sourceName: orcidSource.name,
          sourceUrl: `https://orcid.org/${orcidId}`,
          evidence: {
            paperTitle: recentPaperTitle || `Research in ${topic}`,
            doi: recentPaperDoi,
            year: recentPaperYear,
            grantTitle: roleTitle,
          },
        });
      }

      return candidates;
    } catch (err: any) {
      console.warn(`[ORCID Public API] Non-fatal query error: ${err.message}`);
      return [];
    }
  },
};
