async function testSearch() {
  const apiKey = process.env.TAVILY_API_KEY;
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: '"PhD studentship" OR "fully funded PhD" "clinical pharmacy" OR "antimicrobial stewardship"',
      include_domains: ['findaphd.com', 'jobs.ac.uk', 'euraxess.ec.europa.eu'],
      search_depth: 'advanced',
      max_results: 5,
    }),
  });
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Results count:', data.results?.length);
  for (const r of data.results || []) {
    console.log('----------------');
    console.log('Title:', r.title);
    console.log('URL:', r.url);
    console.log('Content preview:', r.content?.slice(0, 300));
  }
}

testSearch();
