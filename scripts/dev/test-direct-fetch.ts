async function testDirectFetch() {
  const url = 'https://www.findaphd.com/phds/project/antimicrobial-resistance-and-gene-regulation-in-enteroaggregative-escherichia-coli?p196321=';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
  });
  console.log('Direct fetch status:', res.status);
  const html = await res.text();
  console.log('HTML length:', html.length);
  // Look for supervisor, university, deadline in html
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  console.log('Title:', titleMatch?.[1]);
  // Look for supervisor text
  const supMatch = html.match(/supervisor[s]?[:\s]*<[^>]*>([^<]+)</i) || html.match(/(?:Dr|Prof\.|Professor)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
  console.log('Supervisor match:', supMatch?.[0]);
}

testDirectFetch();
