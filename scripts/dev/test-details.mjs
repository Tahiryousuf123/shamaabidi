const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'shamaabidiphd@gmail.com';
const USER_AGENT = `PhDReach/2.0 (mailto:${CONTACT_EMAIL})`;

async function checkGtr() {
  console.log('--- Checking UKRI GtR ---');
  // Try different parameter forms
  const urls = [
    'https://gtr.ukri.org/gtr/api/projects?q=antimicrobial&s=5&p=1',
    'https://gtr.ukri.org/gtr/api/projects?term=antimicrobial&size=5',
    'https://gtr.ukri.org/gtr/api/projects?q=*&s=5',
    'https://gtr.ukri.org/gtr/api/projects?q=antimicrobial',
    'https://gtr.ukri.org/gtr/api/projects',
  ];

  for (const u of urls) {
    try {
      const res = await fetch(u, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': USER_AGENT,
        },
      });
      console.log(`URL: ${u} => status ${res.status}`);
      if (res.ok) {
        const text = await res.text();
        console.log(`Success! Data length: ${text.length}, preview: ${text.slice(0, 200)}`);
        break;
      } else {
        const text = await res.text();
        console.log(`Error body: ${text.slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`Exception: ${e.message}`);
    }
  }
}

async function checkNih() {
  console.log('\n--- Checking NIH RePORTER ---');
  const body = {
    criteria: {
      advanced_text_search: {
        operator: 'and',
        search_field: 'terms',
        search_text: 'antimicrobial stewardship',
      },
      is_active: true,
    },
    limit: 5,
    offset: 0,
  };
  try {
    const res = await fetch('https://api.reporter.nih.gov/v2/projects/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify(body),
    });
    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log(`Total count: ${data.total}, results length: ${data.results?.length}`);
    if (data.results?.length > 0) {
      const p = data.results[0];
      console.log('Sample project:', {
        project_num: p.project_num,
        project_title: p.project_title,
        pi: p.principal_investigators?.[0],
        org: p.org_name,
        country: p.org_country,
      });
    }
  } catch (e) {
    console.log(`NIH Exception: ${e.message}`);
  }
}

async function checkS2() {
  console.log('\n--- Checking Semantic Scholar ---');
  // S2 graph API: test with 1-second delay, retry, or different user agent
  const url = 'https://api.semanticscholar.org/graph/v1/paper/search?query=antimicrobial+stewardship&year=2023-&fields=title,year,externalIds,authors.name,authors.affiliations,authors.externalIds,venue&limit=5';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`Attempt ${attempt}...`);
      const res = await fetch(url, {
        headers: {
          'User-Agent': `MyResearchBot/1.0 (${CONTACT_EMAIL})`,
        },
      });
      console.log(`S2 status: ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        console.log(`S2 items found: ${data.total || data.data?.length}`);
        break;
      } else {
        const text = await res.text();
        console.log(`S2 response: ${text}`);
      }
    } catch (e) {
      console.log(`S2 error: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function checkCordis() {
  console.log('\n--- Checking CORDIS ---');
  const cordisUrl = 'https://cordis.europa.eu/search/en?q=antimicrobial+stewardship&p=1&num=3&type=project&format=json';
  try {
    const res = await fetch(cordisUrl, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' } });
    console.log(`CORDIS status: ${res.status}, content-type: ${res.headers.get('content-type')}`);
    const data = await res.json();
    console.log('CORDIS data keys:', Object.keys(data));
    if (data.results) {
      console.log('Results sample:', JSON.stringify(data.results[0], null, 2).slice(0, 500));
    } else {
      console.log('Preview:', JSON.stringify(data).slice(0, 300));
    }
  } catch (e) {
    console.log(`CORDIS exception: ${e.message}`);
  }
}

async function checkOrcidDetails() {
  console.log('\n--- Checking ORCID Details ---');
  // Search for an author and then get employments / works
  try {
    const searchUrl = 'https://pub.orcid.org/v3.0/expanded-search/?q=Shama+Abidi&rows=1';
    const sRes = await fetch(searchUrl, {
      headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT },
    });
    console.log(`Search status: ${sRes.status}`);
    const sData = await sRes.json();
    const orcidId = sData?.['expanded-result']?.[0]?.['orcid-id'];
    console.log(`Found ORCID: ${orcidId}`);
    if (orcidId) {
      const empUrl = `https://pub.orcid.org/v3.0/${orcidId}/employments`;
      const empRes = await fetch(empUrl, {
        headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT },
      });
      console.log(`Employments status for ${orcidId}: ${empRes.status}`);
      if (empRes.ok) {
        const empData = await empRes.json();
        console.log('Employments summary count:', empData['affiliation-group']?.length);
      }
    }
  } catch (e) {
    console.log(`ORCID details exception: ${e.message}`);
  }
}

async function run() {
  await checkGtr();
  await checkNih();
  await checkCordis();
  await checkOrcidDetails();
  await checkS2();
}

run().catch(console.error);
