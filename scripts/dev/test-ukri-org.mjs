const USER_AGENT = 'PhDReach/2.0 (mailto:shamaabidiphd@gmail.com)';

async function testUkriOrg() {
  const orgHref = 'http://gtr.ukri.org/gtr/api/organisations/8E38A887-3CD8-49FD-87E5-A1844E81B9CF';
  const res = await fetch(orgHref, { headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT } });
  console.log('Org status:', res.status);
  const data = await res.json();
  console.log('Org data:', {
    name: data.name,
    addresses: data.addresses,
  });
}

testUkriOrg().catch(console.error);
