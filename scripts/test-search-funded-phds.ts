async function testSearchFundedPhDs() {
  const apiKey = process.env.TAVILY_API_KEY;
  const queries = [
    'site:findaphd.com/phds/project ("funded" OR "studentship") ("antimicrobial" OR "clinical pharmacy" OR "medication safety")',
    'site:jobs.ac.uk/job "PhD Studentship" ("antimicrobial" OR "pharmacy" OR "medicines" OR "healthcare")',
    'site:findaphd.com/phds/program "fully funded" ("antimicrobial" OR "pharmacy" OR "infection")',
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
        max_results: 5,
      }),
    });
    const data = await res.json();
    for (const r of data.results || []) {
      console.log('-> TITLE:', r.title);
      console.log('   URL:', r.url);
      console.log('   SNIPPET:', r.content?.slice(0, 250).replace(/\s+/g, ' '));
    }
  }
}

testSearchFundedPhDs();
