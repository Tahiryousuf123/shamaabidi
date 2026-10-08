async function testFunded() {
  const apiKey = process.env.TAVILY_API_KEY;
  const queries = [
    'site:findaphd.com "fully funded" ("clinical pharmacy" OR "pharmacy practice" OR "medication safety" OR "antimicrobial stewardship")',
    'site:jobs.ac.uk/job ("PhD studentship" OR "fully funded PhD") ("antimicrobial stewardship" OR "clinical pharmacy" OR "medication safety")',
    'site:findaphd.com ("PhD studentship" OR "fully funded") ("antimicrobial resistance" OR "clinical pharmacy")',
    'site:euraxess.ec.europa.eu ("PhD" OR "doctoral") ("clinical pharmacy" OR "antimicrobial" OR "pharmacovigilance") ("funded" OR "fellowship")',
  ];

  for (const q of queries) {
    console.log('\n=============================================');
    console.log('QUERY:', q);
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: q,
        search_depth: 'advanced',
        max_results: 3,
      }),
    });
    const data = await res.json();
    for (const r of data.results || []) {
      console.log('---');
      console.log('TITLE:', r.title);
      console.log('URL:', r.url);
      console.log('CONTENT:', r.content?.slice(0, 350));
    }
  }
}

testFunded();
