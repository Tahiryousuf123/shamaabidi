const USER_AGENT = 'PhDReach/2.0 (mailto:shamaabidiphd@gmail.com)';

async function inspectCordisHitDetail() {
  const cordisUrl = 'https://cordis.europa.eu/search/en?q=antimicrobial+stewardship&p=1&num=1&type=project&format=json';
  const res = await fetch(cordisUrl, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' } });
  const data = await res.json();
  const rawHit = Array.isArray(data?.hits?.hit) ? data.hits.hit[0] : data?.hits?.hit;
  console.log('Project keys:', Object.keys(rawHit?.project || {}));
  console.log('Project relations:', JSON.stringify(rawHit?.project?.relations, null, 2));
  console.log('Project organization / coordinator info:', {
    acronym: rawHit?.project?.acronym,
    title: rawHit?.project?.title,
    id: rawHit?.project?.id,
    rcn: rawHit?.project?.rcn,
    startDate: rawHit?.project?.startDate,
    endDate: rawHit?.project?.endDate,
    status: rawHit?.project?.status,
    ecMaxContribution: rawHit?.project?.ecMaxContribution,
  });
}

inspectCordisHitDetail().catch(console.error);
