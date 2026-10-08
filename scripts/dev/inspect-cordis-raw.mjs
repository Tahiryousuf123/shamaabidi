const USER_AGENT = 'PhDReach/2.0 (mailto:shamaabidiphd@gmail.com)';

async function inspectCordisRawData() {
  const cordisUrl = 'https://cordis.europa.eu/search/en?q=antimicrobial+stewardship&p=1&num=1&type=project&format=json';
  const res = await fetch(cordisUrl, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' } });
  const text = await res.text();
  console.log('Text from 400 to 1800:', text.slice(400, 1800));
}

inspectCordisRawData().catch(console.error);
