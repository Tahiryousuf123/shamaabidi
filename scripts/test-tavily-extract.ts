async function testTavilyExtract() {
  const apiKey = process.env.TAVILY_API_KEY;
  const url = 'https://www.findaphd.com/phds/project/antimicrobial-resistance-and-gene-regulation-in-enteroaggregative-escherichia-coli?p196321=';
  const res = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      urls: [url],
    }),
  });
  console.log('Extract status:', res.status);
  const data = await res.json();
  const result = data.results?.[0];
  console.log('Extract raw content length:', result?.raw_content?.length);
  console.log('Extract text excerpt:\n', result?.raw_content?.slice(0, 800));
}

testTavilyExtract();
