import { DiscoveryQuery, DiscoveryCandidate, DiscoverySourceModule } from '../types';
import { SOURCES_CONFIG, getDateWindow, isTargetRegion } from '../config';
import { resilientFetchJson } from '../http';

interface Official {
  name?: string;
  affiliation?: string;
  role?: string;
}

interface ResponsibleParty {
  type?: string;
  investigatorFullName?: string;
  investigatorTitle?: string;
  investigatorAffiliation?: string;
}

interface ClinicalStudy {
  protocolSection?: {
    identificationModule?: {
      nctId?: string;
      briefTitle?: string;
      officialTitle?: string;
    };
    statusModule?: {
      startDateStruct?: { date?: string };
      overallStatus?: string;
    };
    sponsorCollaboratorsModule?: {
      responsibleParty?: ResponsibleParty;
      leadSponsor?: { name?: string };
    };
    contactsLocationsModule?: {
      overallOfficials?: Official[];
      centralContacts?: Array<{ name?: string; email?: string; phone?: string; role?: string }>;
    };
  };
}

interface ClinicalTrialsResponse {
  studies?: ClinicalStudy[];
}

export const clinicalTrialsSource: DiscoverySourceModule = {
  name: 'ClinicalTrials.gov API v2',
  config: SOURCES_CONFIG.clinicaltrials,
  search: async ({ topic, dateFrom, regions, limit = 20 }: DiscoveryQuery): Promise<DiscoveryCandidate[]> => {
    if (!clinicalTrialsSource.config.enabled) return [];

    const dateWin = getDateWindow(3);
    const fromDate = dateFrom ? `${dateFrom}-01-01` : dateWin.fromDate;

    const query = encodeURIComponent(topic);
    const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${query}&filter.advanced=AREA[StartDate]RANGE[${fromDate},MAX]&pageSize=${Math.min(limit * 2, 40)}&format=json`;

    const res = await resilientFetchJson<ClinicalTrialsResponse>(url, {
      delayMs: clinicalTrialsSource.config.delayMs,
    });

    const studies = res.data?.studies || [];
    const candidates: DiscoveryCandidate[] = [];

    for (const s of studies) {
      const proto = s.protocolSection;
      if (!proto) continue;

      const nctId = proto.identificationModule?.nctId || '';
      const trialTitle = proto.identificationModule?.briefTitle || proto.identificationModule?.officialTitle || 'Clinical Trial';
      const status = proto.statusModule?.overallStatus || 'ACTIVE';
      const year = proto.statusModule?.startDateStruct?.date
        ? parseInt(proto.statusModule.startDateStruct.date.slice(0, 4), 10)
        : dateWin.toYear;
      const leadSponsor = proto.sponsorCollaboratorsModule?.leadSponsor?.name;

      const officials = proto.contactsLocationsModule?.overallOfficials || [];
      const respParty = proto.sponsorCollaboratorsModule?.responsibleParty;

      const investigators: Array<{
        name: string;
        institution: string;
        role: string;
      }> = [];

      // Extract from responsibleParty
      if (respParty?.investigatorFullName) {
        investigators.push({
          name: respParty.investigatorFullName.replace(/^Dr\.\s*|^Prof\.\s*/i, '').trim(),
          institution: respParty.investigatorAffiliation || leadSponsor || 'Academic Medical Centre',
          role: respParty.investigatorTitle || 'Principal Investigator',
        });
      }

      // Extract from overallOfficials
      for (const off of officials) {
        if (off.name) {
          investigators.push({
            name: off.name.replace(/^Dr\.\s*|^Prof\.\s*/i, '').trim(),
            institution: off.affiliation || leadSponsor || 'Academic Medical Centre',
            role: off.role || 'Principal Investigator',
          });
        }
      }

      // Check central contacts for publicly listed email
      const centralContact = proto.contactsLocationsModule?.centralContacts?.[0];
      const contactEmail = centralContact?.email || null;

      const seen = new Set<string>();

      for (const inv of investigators) {
        if (!inv.name || seen.has(inv.name)) continue;
        seen.add(inv.name);

        if (inv.institution && !isTargetRegion(inv.institution, false)) {
          continue;
        }

        const sourceUrl = nctId ? `https://clinicaltrials.gov/study/${nctId}` : 'https://clinicaltrials.gov/';

        candidates.push({
          name: inv.name,
          institution: inv.institution,
          country: inv.institution.split(',').pop()?.trim() || 'Global Target Region',
          orcid: null,
          openalexId: null,
          email: contactEmail,
          emailSourceUrl: contactEmail ? sourceUrl : null,
          sourceName: clinicalTrialsSource.name,
          sourceUrl,
          evidence: {
            grantId: nctId,
            grantTitle: trialTitle,
            grantStatus: status.toLowerCase().includes('completed') ? 'closed' : 'active',
            fundingBody: leadSponsor || 'Clinical Trial Sponsor',
            paperTitle: `Clinical Trial: ${trialTitle}`,
            year,
          },
        });
      }
    }

    return candidates;
  },
};
