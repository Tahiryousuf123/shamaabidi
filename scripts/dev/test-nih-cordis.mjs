const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'shamaabidiphd@gmail.com';
const USER_AGENT = `PhDReach/2.0 (mailto:${CONTACT_EMAIL})`;

async function testNihPayload() {
  console.log('Testing NIH Reporter payloads...');
  // 1. Test basic text_search
  const payloads = [
    {
      criteria: {
        advanced_text_search: {
          operator: 'and',
          search_field: 'terms',
          search_text: 'antimicrobial stewardship',
        },
      },
      limit: 10,
      offset: 0,
    },
    {
      criteria: {
        project_title: 'antimicrobial',
      },
      limit: 5,
    },
    {
      criteria: {
        use_relevance: true,
        advanced_text_search: {
          operator: 'or',
          search_field: 'all',
          search_text: 'antimicrobial stewardship',
        },
      },
      limit: 5,
    },
    {
      criteria: {
        search_terms: 'antimicrobial stewardship',
      },
      limit: 5,
    },
  ];

  for (let i = 0; i < payloads.length; i++) {
    const res = await fetch('https://api.reporter.nih.gov/v2/projects/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify(payloads[i]),
    });
    const data = await res.json();
    console.log(`Payload ${i}: total=${data?.meta?.total ?? data?.total}, count=${data?.results?.length}`);
    if (data?.results?.length > 0) {
      console.log('Sample result:', {
        project_num: data.results[0].project_num,
        project_title: data.results[0].project_title,
        org_name: data.results[0].org_name,
        org_country: data.results[0].org_country,
        pis: data.results[0].principal_investigators,
      });
      break;
    }
  }
}

async function testCordisHits() {
  console.log('\nTesting CORDIS hits...');
  const cordisUrl = 'https://cordis.europa.eu/search/en?q=antimicrobial+stewardship&p=1&num=5&type=project&format=json';
  const res = await fetch(cordisUrl, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' } });
  const data = await res.json();
  const hits = data?.hits?.hits || data?.results || [];
  console.log('Hits count:', hits.length);
  if (hits.length > 0) {
    console.log('Sample hit keys:', Object.keys(hits[0]));
    console.log('Sample hit _source keys:', hits[0]._source ? Object.keys(hits[0]._source) : 'No _source');
    const s = hits[0]._source || hits[0];
    console.log('Sample details:', {
      rcn: s.rcn || s.id,
      acronym: s.acronym,
      title: s.title,
      status: s.status,
      startDate: s.startDate,
      endDate: s.endDate,
      totalCost: s.totalCost,
      ecMaxContribution: s.ecMaxContribution,
      coordinator: s.coordinator,
      coordinatorCountry: s.coordinatorCountry,
      objective: s.objective?.slice(0, 150),
    });
  }
}

async function testUkriPageSize() {
  console.log('\nTesting UKRI with s=10...');
  const url = 'https://gtr.ukri.org/gtr/api/projects?q=antimicrobial+stewardship&s=10&p=1';
  const res = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT } });
  console.log('UKRI s=10 status:', res.status);
  if (res.ok) {
    const data = await res.json();
    const projects = data?.project || [];
    console.log('UKRI projects count:', projects.length);
    if (projects.length > 0) {
      const p = projects[0];
      console.log('UKRI Sample Project:', {
        id: p.id,
        title: p.title,
        status: p.status,
        grantCategory: p.grantCategory,
        leadOrg: p.leadOrgDept,
        fund: p.fund,
        links: p.links?.link?.slice(0, 3),
      });
    }
  }
}

async function run() {
  await testNihPayload();
  await testCordisHits();
  await testUkriPageSize();
}

run().catch(console.error);
