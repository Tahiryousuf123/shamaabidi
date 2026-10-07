const USER_AGENT = 'PhDReach/2.0 (mailto:shamaabidiphd@gmail.com)';

async function inspectEuropePmcAuthors() {
  const query = encodeURIComponent(`"antimicrobial stewardship" AND FIRST_PDATE:[2023-01-01 TO 2026-12-31]`);
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${query}&resultType=core&format=json&pageSize=3`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const data = await res.json();
  const sample = data?.resultList?.result?.[0];
  console.log('Europe PMC Sample Result:', {
    id: sample?.id,
    source: sample?.source,
    doi: sample?.doi,
    title: sample?.title,
    pubYear: sample?.pubYear,
    authorList: sample?.authorList?.author?.slice(0, 3),
  });
}

inspectEuropePmcAuthors().catch(console.error);
