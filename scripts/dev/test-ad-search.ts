async function testDetails() {
  const apiKey = process.env.TAVILY_API_KEY;
  // Let's search specifically for project pages on findaphd, jobs.ac.uk, euraxess
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: 'site:findaphd.com/phds/project OR site:jobs.ac.uk/job ("clinical pharmacy" OR "medication safety" OR "antimicrobial stewardship") ("fully funded" OR "studentship" OR "scholarship")',
      search_depth: 'advanced',
      max_results: 5,
    }),
  });
  const data = await res.json();
  console.log('Results count:', data.results?.length);
  for (const r of data.results || []) {
    console.log('================');
    console.log('Title:', r.title);
    console.log('URL:', r.url);
    console.log('Content:\n', r.content);
  }
}

testDetails();
