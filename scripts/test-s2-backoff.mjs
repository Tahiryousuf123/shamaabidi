const USER_AGENT = 'PhDReach/2.0 (mailto:shamaabidiphd@gmail.com)';

async function testS2Backoff() {
  const url = 'https://api.semanticscholar.org/graph/v1/paper/search?query=antimicrobial+stewardship&year=2023-&fields=title,year,externalIds,authors.name,authors.affiliations,authors.externalIds,venue&limit=3';
  let delay = 1500;
  for (let i = 0; i < 4; i++) {
    try {
      console.log(`S2 try ${i + 1} with delay ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      console.log(`S2 status: ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        console.log(`Success! Found ${data.data?.length} papers. First:`, data.data?.[0]?.title);
        return;
      }
      if (res.status === 429) {
        delay *= 2;
      }
    } catch (e) {
      console.log(`Err: ${e.message}`);
    }
  }
}

testS2Backoff().catch(console.error);
