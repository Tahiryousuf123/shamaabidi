async function inspectExtract2() {
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
  const data = await res.json();
  const raw = data.results?.[0]?.raw_content || '';
  console.log('--- EXTRACT SAMPLE (chars 3000 - 6500) ---');
  console.log(raw.slice(3000, 6500));
}

inspectExtract2();
