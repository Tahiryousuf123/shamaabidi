const USER_AGENT = 'PhDReach/2.0 (mailto:shamaabidiphd@gmail.com)';

async function testUkriPersonAndOrg() {
  const personHref = 'http://gtr.ukri.org/gtr/api/persons/20ACB5C2-943B-4E69-862A-1CDFFAA3C6D4';
  const res = await fetch(personHref, { headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT } });
  console.log('Person status:', res.status);
  const data = await res.json();
  console.log('Person data:', {
    firstName: data.firstName,
    otherNames: data.otherNames,
    surname: data.surname,
    orcidId: data.orcidId,
  });
}

testUkriPersonAndOrg().catch(console.error);
