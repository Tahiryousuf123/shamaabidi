async function testRawContent() {
  const apiKey = process.env.TAVILY_API_KEY;
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: 'site:findaphd.com/phds/project "antimicrobial" ("fully funded" OR "studentship")',
      search_depth: 'advanced',
      include_raw_content: true,
      max_results: 1,
    }),
  });
  const data = await res.json();
  const first = data.results?.[0];
  console.log('Title:', first?.title);
  console.log('URL:', first?.url);
  console.log('Content length:', first?.content?.length);
  console.log('Raw content length:', first?.raw_content?.length);
  console.log('Content excerpt:', first?.content?.slice(0, 500));
}

testRawContent();
