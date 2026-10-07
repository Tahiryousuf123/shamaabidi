const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'shamaabidiphd@gmail.com';
const USER_AGENT = `PhDReach/2.0 (mailto:${CONTACT_EMAIL})`;

async function inspectCrossrefAuthors() {
  const query = encodeURIComponent(`antimicrobial stewardship`);
  const url = `https://api.crossref.org/works?query.bibliographic=${query}&filter=from-pub-date:2023-01-01,type:journal-article&select=DOI,title,author,issued,container-title&rows=2&mailto=${encodeURIComponent(CONTACT_EMAIL)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const data = await res.json();
  const item = data?.message?.items?.[0];
  console.log('Crossref sample item:');
  console.log('DOI:', item?.DOI);
  console.log('Title:', item?.title?.[0]);
  console.log('Authors:', JSON.stringify(item?.author?.slice(0, 3), null, 2));
}

inspectCrossrefAuthors().catch(console.error);
