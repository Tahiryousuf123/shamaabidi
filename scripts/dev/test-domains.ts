async function testDomains() {
  const apiKey = process.env.TAVILY_API_KEY;

  // Test 1: include_domains with findaphd.com, jobs.ac.uk, euraxess.ec.europa.eu
  const res1 = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: '"PhD studentship" OR "fully funded PhD" "clinical pharmacy" OR "medication safety" OR "antimicrobial stewardship"',
      include_domains: ['findaphd.com', 'jobs.ac.uk', 'euraxess.ec.europa.eu'],
      max_results: 10,
    }),
  });
  const data1 = await res1.json();
  console.log('Test 1 include_domains results count:', data1.results?.length);
  for (const r of data1.results || []) {
    console.log('->', r.title, '| URL:', r.url);
  }

  // Test 2: Can include_domains take .ac.uk or does it error?
  const res2 = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: '"PhD studentship" OR "fully funded" "clinical pharmacy" OR "antimicrobial stewardship"',
      include_domains: ['findaphd.com', 'jobs.ac.uk', 'euraxess.ec.europa.eu', 'ac.uk', 'edu'],
      max_results: 5,
    }),
  });
  console.log('Test 2 status with ac.uk in include_domains:', res2.status);
  const data2 = await res2.json();
  console.log('Test 2 count:', data2.results?.length);
  for (const r of data2.results || []) {
    console.log('->', r.title, '| URL:', r.url);
  }
}

testDomains();
