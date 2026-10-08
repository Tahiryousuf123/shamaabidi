const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'shamaabidiphd@gmail.com';
const USER_AGENT = `PhDReach/2.0 (mailto:${CONTACT_EMAIL})`;

async function testOpenAlexAuthor() {
  // 1. Search by ORCID
  const orcid = 'https://orcid.org/0000-0003-1248-042X';
  const urlOrcid = `https://api.openalex.org/authors?filter=orcid:${encodeURIComponent(orcid)}&mailto=${encodeURIComponent(CONTACT_EMAIL)}`;
  const res1 = await fetch(urlOrcid, { headers: { 'User-Agent': USER_AGENT } });
  console.log('OpenAlex ORCID status:', res1.status);
  const data1 = await res1.json();
  const author1 = data1?.results?.[0];
  console.log('Found by ORCID:', {
    id: author1?.id,
    display_name: author1?.display_name,
    orcid: author1?.orcid,
    institutions: author1?.last_known_institutions?.map(i => i.display_name),
    works_count: author1?.works_count,
  });

  // 2. Search by Name
  const name = 'Adam Roberts';
  const urlName = `https://api.openalex.org/authors?search=${encodeURIComponent(name)}&mailto=${encodeURIComponent(CONTACT_EMAIL)}`;
  const res2 = await fetch(urlName, { headers: { 'User-Agent': USER_AGENT } });
  console.log('OpenAlex Name search status:', res2.status);
  const data2 = await res2.json();
  const candidates = (data2?.results || []).slice(0, 3).map(a => ({
    id: a.id,
    display_name: a.display_name,
    orcid: a.orcid,
    institutions: a.last_known_institutions?.map(i => i.display_name),
    works_count: a.works_count,
  }));
  console.log('Found by Name candidates:', candidates);
}

testOpenAlexAuthor().catch(console.error);
