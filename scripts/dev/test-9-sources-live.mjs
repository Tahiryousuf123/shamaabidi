// Live test script to probe the 9 free discovery sources
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'shamaabidiphd@gmail.com';
const USER_AGENT = `PhDReach/2.0 (mailto:${CONTACT_EMAIL})`;

const TOPIC = 'antimicrobial stewardship';

async function testPubMed() {
  const start = Date.now();
  try {
    const term = encodeURIComponent(`${TOPIC}[tiab]`);
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${term}&retmode=json&retmax=3`;
    const res = await fetch(searchUrl, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return { name: 'PubMed', ok: false, status: res.status, error: res.statusText, duration: Date.now() - start };
    const data = await res.json();
    const ids = data?.esearchresult?.idlist || [];
    
    // Test efetch if IDs returned
    let efetchOk = false;
    if (ids.length > 0) {
      const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids[0]}&retmode=xml`;
      const fetchRes = await fetch(fetchUrl, { headers: { 'User-Agent': USER_AGENT } });
      efetchOk = fetchRes.ok;
    }
    return {
      name: 'PubMed (NCBI E-utilities)',
      ok: true,
      status: res.status,
      count: ids.length,
      sampleId: ids[0],
      efetchOk,
      duration: Date.now() - start,
    };
  } catch (err) {
    return { name: 'PubMed (NCBI E-utilities)', ok: false, error: err.message, duration: Date.now() - start };
  }
}

async function testEuropePMC() {
  const start = Date.now();
  try {
    const query = encodeURIComponent(`${TOPIC} AND FIRST_PDATE:[2023-01-01 TO 2026-12-31]`);
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${query}&resultType=core&format=json&pageSize=3`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return { name: 'Europe PMC', ok: false, status: res.status, error: res.statusText, duration: Date.now() - start };
    const data = await res.json();
    const list = data?.resultList?.result || [];
    const sample = list[0];
    return {
      name: 'Europe PMC REST',
      ok: true,
      status: res.status,
      count: list.length,
      sampleTitle: sample?.title?.slice(0, 60),
      hasAuthors: Boolean(sample?.authorList?.author?.length),
      duration: Date.now() - start,
    };
  } catch (err) {
    return { name: 'Europe PMC REST', ok: false, error: err.message, duration: Date.now() - start };
  }
}

async function testSemanticScholar() {
  const start = Date.now();
  try {
    const query = encodeURIComponent(TOPIC);
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${query}&year=2023-&fields=title,year,externalIds,authors.name,authors.affiliations,authors.externalIds,venue&limit=3`;
    const headers = { 'User-Agent': USER_AGENT };
    if (process.env.S2_API_KEY) headers['x-api-key'] = process.env.S2_API_KEY;
    const res = await fetch(url, { headers });
    if (!res.ok) return { name: 'Semantic Scholar Graph API', ok: false, status: res.status, error: res.statusText, duration: Date.now() - start };
    const data = await res.json();
    const list = data?.data || [];
    return {
      name: 'Semantic Scholar Graph API',
      ok: true,
      status: res.status,
      count: list.length,
      sampleTitle: list[0]?.title?.slice(0, 60),
      duration: Date.now() - start,
    };
  } catch (err) {
    return { name: 'Semantic Scholar Graph API', ok: false, error: err.message, duration: Date.now() - start };
  }
}

async function testCrossref() {
  const start = Date.now();
  try {
    const query = encodeURIComponent(TOPIC);
    const url = `https://api.crossref.org/works?query.bibliographic=${query}&filter=from-pub-date:2023-01-01,type:journal-article&select=DOI,title,author,issued,container-title&rows=3&mailto=${encodeURIComponent(CONTACT_EMAIL)}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return { name: 'Crossref', ok: false, status: res.status, error: res.statusText, duration: Date.now() - start };
    const data = await res.json();
    const items = data?.message?.items || [];
    return {
      name: 'Crossref',
      ok: true,
      status: res.status,
      count: items.length,
      sampleTitle: items[0]?.title?.[0]?.slice(0, 60),
      duration: Date.now() - start,
    };
  } catch (err) {
    return { name: 'Crossref', ok: false, error: err.message, duration: Date.now() - start };
  }
}

async function testOrcid() {
  const start = Date.now();
  try {
    // Test public expanded search
    const query = encodeURIComponent(`"antimicrobial stewardship"`);
    const url = `https://pub.orcid.org/v3.0/expanded-search/?q=${query}&rows=3`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
      },
    });
    if (!res.ok) {
      return {
        name: 'ORCID Public API',
        ok: false,
        status: res.status,
        error: `HTTP ${res.status}: ${res.statusText}`,
        needsToken: res.status === 401 || res.status === 403,
        duration: Date.now() - start,
      };
    }
    const data = await res.json();
    const results = data?.['expanded-result'] || [];
    return {
      name: 'ORCID Public API',
      ok: true,
      status: res.status,
      count: results.length,
      sampleOrcid: results[0]?.['orcid-id'],
      sampleName: `${results[0]?.['given-names'] || ''} ${results[0]?.['family-names'] || ''}`.trim(),
      duration: Date.now() - start,
    };
  } catch (err) {
    return { name: 'ORCID Public API', ok: false, error: err.message, duration: Date.now() - start };
  }
}

async function testClinicalTrials() {
  const start = Date.now();
  try {
    const query = encodeURIComponent(TOPIC);
    const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${query}&filter.advanced=AREA[StartDate]RANGE[2023-01-01,MAX]&pageSize=3&format=json`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return { name: 'ClinicalTrials.gov API v2', ok: false, status: res.status, error: res.statusText, duration: Date.now() - start };
    const data = await res.json();
    const studies = data?.studies || [];
    const firstStudy = studies[0]?.protocolSection;
    return {
      name: 'ClinicalTrials.gov API v2',
      ok: true,
      status: res.status,
      count: studies.length,
      sampleNctId: firstStudy?.identificationModule?.nctId,
      sampleTitle: firstStudy?.identificationModule?.briefTitle?.slice(0, 60),
      duration: Date.now() - start,
    };
  } catch (err) {
    return { name: 'ClinicalTrials.gov API v2', ok: false, error: err.message, duration: Date.now() - start };
  }
}

async function testUkriGtr() {
  const start = Date.now();
  try {
    const query = encodeURIComponent(TOPIC);
    const url = `https://gtr.ukri.org/gtr/api/projects?q=${query}&s=3&p=1`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
      },
    });
    if (!res.ok) return { name: 'UKRI Gateway to Research', ok: false, status: res.status, error: res.statusText, duration: Date.now() - start };
    const data = await res.json();
    const projects = data?.project || [];
    return {
      name: 'UKRI Gateway to Research (GtR API)',
      ok: true,
      status: res.status,
      count: projects.length,
      sampleTitle: projects[0]?.title?.slice(0, 60),
      sampleStatus: projects[0]?.status,
      duration: Date.now() - start,
    };
  } catch (err) {
    return { name: 'UKRI Gateway to Research (GtR API)', ok: false, error: err.message, duration: Date.now() - start };
  }
}

async function testNihReporter() {
  const start = Date.now();
  try {
    const currentYear = new Date().getFullYear();
    const body = {
      criteria: {
        advanced_text_search: {
          operator: 'and',
          search_field: 'terms',
          search_text: TOPIC,
        },
        is_active: true,
        fiscal_years: [currentYear, currentYear - 1],
      },
      limit: 3,
      offset: 0,
    };
    const res = await fetch('https://api.reporter.nih.gov/v2/projects/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { name: 'NIH RePORTER v2', ok: false, status: res.status, error: res.statusText, duration: Date.now() - start };
    const data = await res.json();
    const results = data?.results || [];
    return {
      name: 'NIH RePORTER v2',
      ok: true,
      status: res.status,
      count: results.length,
      sampleTitle: results[0]?.project_title?.slice(0, 60),
      samplePi: results[0]?.principal_investigators?.[0]?.full_name,
      duration: Date.now() - start,
    };
  } catch (err) {
    return { name: 'NIH RePORTER v2', ok: false, error: err.message, duration: Date.now() - start };
  }
}

async function testCordis() {
  const start = Date.now();
  // 1. Try public CORDIS search / open endpoint
  try {
    // Try CORDIS search endpoint
    const cordisUrl = `https://cordis.europa.eu/search/en?q=${encodeURIComponent(TOPIC)}&p=1&num=3&type=project&format=json`;
    const res = await fetch(cordisUrl, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' } });
    if (res.ok && res.headers.get('content-type')?.includes('json')) {
      const data = await res.json();
      return {
        name: 'CORDIS (EU Open Endpoint)',
        ok: true,
        status: res.status,
        method: 'direct_json',
        data,
        duration: Date.now() - start,
      };
    }
  } catch {}

  // Try EU Open Data / data.europa.eu SPARQL or API
  try {
    const dataEuropaUrl = `https://data.europa.eu/api/hub/search/datasets?q=${encodeURIComponent('cordis ' + TOPIC)}&limit=3`;
    const res = await fetch(dataEuropaUrl, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      const count = data?.result?.results?.length || 0;
      if (count > 0) {
        return {
          name: 'CORDIS (data.europa.eu endpoint)',
          ok: true,
          status: res.status,
          count,
          method: 'data_europa_api',
          duration: Date.now() - start,
        };
      }
    }
  } catch {}

  // Test CORDIS via Tavily fallback (site:cordis.europa.eu)
  const tavilyKey = (process.env.TAVILY_API_KEY || '').trim();
  if (tavilyKey) {
    try {
      const tavilyRes = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: `site:cordis.europa.eu "${TOPIC}" (project OR "Horizon Europe" OR "MSCA")`,
          max_results: 3,
        }),
      });
      if (tavilyRes.ok) {
        const tData = await tavilyRes.json();
        return {
          name: 'CORDIS (via Tavily site:cordis.europa.eu fallback)',
          ok: true,
          status: tavilyRes.status,
          count: tData?.results?.length || 0,
          sampleUrl: tData?.results?.[0]?.url,
          sampleTitle: tData?.results?.[0]?.title?.slice(0, 60),
          method: 'tavily_fallback',
          duration: Date.now() - start,
        };
      }
    } catch (tErr) {
      return {
        name: 'CORDIS (all endpoints tested)',
        ok: false,
        error: `Direct endpoint not open, Tavily fallback failed: ${tErr.message}`,
        duration: Date.now() - start,
      };
    }
  }

  return {
    name: 'CORDIS',
    ok: false,
    error: 'Direct API requires authentication, fallback required',
    duration: Date.now() - start,
  };
}

async function runAll() {
  console.log('Testing 9 Discovery Endpoints Live...\n');
  const results = await Promise.all([
    testPubMed(),
    testEuropePMC(),
    testSemanticScholar(),
    testCrossref(),
    testOrcid(),
    testClinicalTrials(),
    testUkriGtr(),
    testNihReporter(),
    testCordis(),
  ]);

  for (const r of results) {
    console.log(`[${r.ok ? 'SUCCESS' : 'FAILED'}] ${r.name}`);
    console.log(`  Duration: ${r.duration}ms | Status: ${r.status || 'N/A'}`);
    if (r.count !== undefined) console.log(`  Results count: ${r.count}`);
    if (r.sampleTitle) console.log(`  Sample Title: ${r.sampleTitle}`);
    if (r.sampleId) console.log(`  Sample ID: ${r.sampleId} (efetch: ${r.efetchOk ? 'OK' : 'FAILED'})`);
    if (r.sampleOrcid) console.log(`  Sample ORCID: ${r.sampleOrcid} (${r.sampleName})`);
    if (r.samplePi) console.log(`  Sample PI: ${r.samplePi}`);
    if (r.method) console.log(`  Method: ${r.method}`);
    if (r.error) console.log(`  Error: ${r.error}`);
    console.log('');
  }
}

runAll().catch(console.error);
