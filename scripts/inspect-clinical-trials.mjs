const USER_AGENT = 'PhDReach/2.0 (mailto:shamaabidiphd@gmail.com)';

async function inspectClinicalTrials() {
  const query = encodeURIComponent(`antimicrobial stewardship`);
  const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${query}&filter.advanced=AREA[StartDate]RANGE[2023-01-01,MAX]&pageSize=3&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const data = await res.json();
  const studies = data?.studies || [];
  for (const s of studies) {
    const proto = s.protocolSection;
    const nctId = proto?.identificationModule?.nctId;
    const title = proto?.identificationModule?.briefTitle;
    const officials = proto?.contactsLocationsModule?.overallOfficials || [];
    const respParty = proto?.sponsorCollaboratorsModule?.responsibleParty || {};
    const leadSponsor = proto?.sponsorCollaboratorsModule?.leadSponsor || {};
    console.log('Study:', nctId, '|', title?.slice(0, 50));
    console.log('  Officials:', JSON.stringify(officials));
    console.log('  Responsible Party:', JSON.stringify(respParty));
    console.log('  Lead Sponsor:', JSON.stringify(leadSponsor));
  }
}

inspectClinicalTrials().catch(console.error);
