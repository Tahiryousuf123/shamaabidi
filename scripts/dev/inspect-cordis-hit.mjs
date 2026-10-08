const USER_AGENT = 'PhDReach/2.0 (mailto:shamaabidiphd@gmail.com)';

async function inspectCordisHits() {
  const cordisUrl = 'https://cordis.europa.eu/search/en?q=antimicrobial+stewardship&p=1&num=3&type=project&format=json';
  const res = await fetch(cordisUrl, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' } });
  const data = await res.json();
  const hit = data?.hits?.hit;
  console.log('hit type:', Array.isArray(hit) ? 'array' : typeof hit);
  console.log('hit length:', Array.isArray(hit) ? hit.length : 'not array');
  if (Array.isArray(hit) && hit.length > 0) {
    const item = hit[0];
    console.log('item keys:', Object.keys(item));
    console.log('Sample item:', {
      project: item.project,
      title: item.title,
      teaser: item.teaser,
      url: item.url,
      type: item.type,
    });
  }
}

inspectCordisHits().catch(console.error);
