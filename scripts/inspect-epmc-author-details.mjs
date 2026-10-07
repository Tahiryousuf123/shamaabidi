const USER_AGENT = 'PhDReach/2.0 (mailto:shamaabidiphd@gmail.com)';

async function inspectEpmcAuthorDetails() {
  const query = encodeURIComponent(`"antimicrobial stewardship" AND FIRST_PDATE:[2023-01-01 TO 2026-12-31]`);
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${query}&resultType=core&format=json&pageSize=2`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const data = await res.json();
  const authors = data?.resultList?.result?.[0]?.authorList?.author || [];
  for (const a of authors.slice(0, 2)) {
    console.log('Author:', a.fullName);
    console.log('authorId:', JSON.stringify(a.authorId));
    console.log('affiliations:', JSON.stringify(a.authorAffiliationDetailsList));
  }
}

inspectEpmcAuthorDetails().catch(console.error);
