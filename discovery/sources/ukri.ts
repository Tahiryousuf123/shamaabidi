import { DiscoveryQuery, DiscoveryCandidate, DiscoverySourceModule } from '../types';
import { SOURCES_CONFIG } from '../config';
import { resilientFetchJson } from '../http';

interface UkriLink {
  href: string;
  rel: string;
}

interface UkriProject {
  id: string;
  title: string;
  status?: string;
  grantCategory?: string;
  fund?: {
    valuePounds?: number;
    start?: string;
    end?: string;
  };
  links?: {
    link?: UkriLink[];
  };
}

interface UkriProjectsResponse {
  project?: UkriProject[];
}

interface UkriPerson {
  firstName?: string;
  otherNames?: string;
  surname?: string;
  orcidId?: string;
}

interface UkriOrganisation {
  name?: string;
}

export const ukriSource: DiscoverySourceModule = {
  name: 'UKRI Gateway to Research',
  config: SOURCES_CONFIG.ukri,
  search: async ({ topic, dateFrom, regions, limit = 15 }: DiscoveryQuery): Promise<DiscoveryCandidate[]> => {
    if (!ukriSource.config.enabled) return [];

    // UKRI GtR requires page size s >= 10
    const pageSize = Math.max(10, Math.min(limit * 2, 30));
    const cleanTopic = topic.replace(/[^\w\s]/g, ' ').trim();
    const query = encodeURIComponent(cleanTopic);
    const url = `https://gtr.ukri.org/gtr/api/projects?q=${query}&s=${pageSize}&p=1`;

    const res = await resilientFetchJson<UkriProjectsResponse>(url, {
      delayMs: ukriSource.config.delayMs,
    });

    const projects = res.data?.project || [];
    const candidates: DiscoveryCandidate[] = [];

    const currentYear = new Date().getFullYear();

    for (const proj of projects) {
      const pId = proj.id;
      const title = proj.title || 'UKRI Research Grant';
      const status = proj.status || 'Active';

      // Keep projects Active or ended within last 2 years
      const isStillRecentOrActive =
        status.toLowerCase() === 'active' ||
        status.toLowerCase() === 'closed' ||
        status.toLowerCase() === 'announced';

      if (!isStillRecentOrActive) continue;

      const links = proj.links?.link || [];
      const piLink = links.find((l) => l.rel === 'PI_PER');
      const leadOrgLink = links.find((l) => l.rel === 'LEAD_ORG');

      if (!piLink) continue;

      let personName = '';
      let orcid: string | null = null;
      let institution = 'UK University';

      try {
        const personUrl = piLink.href.replace(/^http:\/\//i, 'https://');
        const personRes = await resilientFetchJson<UkriPerson>(personUrl, {
          delayMs: 50,
          timeoutMs: 6000,
        });
        const p = personRes.data;
        if (p?.surname) {
          personName = `${p.firstName || ''} ${p.surname}`.trim();
          orcid = p.orcidId ? p.orcidId.replace(/^(https?:\/\/)?orcid\.org\//, '').trim() : null;
        }
      } catch {}

      if (!personName) continue;

      if (leadOrgLink) {
        try {
          const orgUrl = leadOrgLink.href.replace(/^http:\/\//i, 'https://');
          const orgRes = await resilientFetchJson<UkriOrganisation>(orgUrl, {
            delayMs: 50,
            timeoutMs: 6000,
          });
          if (orgRes.data?.name) {
            institution = orgRes.data.name;
          }
        } catch {}
      }

      const projectUrl = `https://gtr.ukri.org/projects?ref=${pId}`;
      const isActive = status.toLowerCase() === 'active';

      candidates.push({
        name: personName,
        institution,
        country: 'United Kingdom',
        orcid,
        openalexId: null,
        email: null,
        emailSourceUrl: null,
        sourceName: ukriSource.name,
        sourceUrl: projectUrl,
        evidence: {
          grantId: pId,
          grantTitle: title,
          grantStatus: isActive ? 'active' : 'closed',
          fundingBody: 'UKRI Research Councils (EPSRC/MRC/NIHR/ESRC)',
          paperTitle: `UKRI Grant: ${title}`,
          year: currentYear,
        },
      });

      if (candidates.length >= limit) break;
    }

    return candidates;
  },
};
