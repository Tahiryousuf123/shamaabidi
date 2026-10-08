const USER_AGENT = 'PhDReach/2.0 (mailto:shamaabidiphd@gmail.com)';

async function inspectCordis() {
  const cordisUrl = 'https://cordis.europa.eu/search/en?q=antimicrobial&p=1&num=3&type=project&format=json';
  const res = await fetch(cordisUrl, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' } });
  const data = await res.json();
  console.log('CORDIS raw keys:', Object.keys(data));
  console.log('Result keys:', Object.keys(data.result || {}));
  console.log('Hits keys:', Object.keys(data.hits || {}));
  if (data.hits) {
    console.log('hits.total:', data.hits.total);
    console.log('hits.hits length:', data.hits.hits?.length);
  }
  // Also check CORDIS project search API or EU data portal
  console.log('Checking alternative CORDIS query endpoints...');
  const altUrls = [
    'https://cordis.europa.eu/api/projects?q=antimicrobial',
    'https://data.europa.eu/api/hub/search/datasets?q=cordis',
  ];
  for (const u of altUrls) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': USER_AGENT } });
      console.log(`URL ${u}: ${r.status}`);
    } catch (e) {
      console.log(`URL ${u} err: ${e.message}`);
    }
  }
}

async function inspectNih() {
  // Let's test search_text without advanced_text_search or with different search_field
  const tests = [
    { advanced_text_search: { operator: 'and', search_field: 'all', search_text: 'antimicrobial stewardship' } },
    { advanced_text_search: { operator: 'or', search_field: 'all', search_text: 'antimicrobial' } },
    { text: 'antimicrobial' },
    { project_title: 'antimicrobial stewardship' },
  ];

  for (let i = 0; i < tests.length; i++) {
    const res = await fetch('https://api.reporter.nih.gov/v2/projects/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ criteria: tests[i], limit: 3, offset: 0 }),
    });
    const d = await res.json();
    console.log(`NIH test ${i}: total=${d.meta?.total}, results=${d.results?.length}`);
    if (d.results?.length > 0) {
      console.log('Found:', d.results[0].project_title);
    }
  }
}

async function run() {
  await inspectCordis();
  await inspectNih();
}

run().catch(console.error);
