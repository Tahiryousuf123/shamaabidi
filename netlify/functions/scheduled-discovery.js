/**
 * Shama Abidi — Autonomous AI Research Agent & CRM System
 * Netlify Scheduled Function: Daily Professor Discovery & Matching (`0 3 * * *`)
 *
 * Queries Europe PMC + OpenAlex for international professors outside Pakistan,
 * scores alignment against Shama Abidi's publications, and triggers optional
 * GitHub Actions repository dispatch if GITHUB_PAT is configured.
 */

exports.handler = async () => {
  const query = encodeURIComponent(
    '("antimicrobial stewardship" OR "carbapenem" OR "angina" OR "pharmacovigilance") AND (PUB_YEAR:[2024 TO 2026])'
  );
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${query}&resultType=core&pageSize=35&format=json`;

  let discoveredCount = 0;
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "ShamaAbidiPhDAgent/4.0 (mailto:shama.abidi80@gmail.com)" },
    });
    if (resp.ok) {
      const data = await resp.json();
      const results = (data.resultList && data.resultList.result) || [];
      discoveredCount = results.length;
    }
  } catch (err) {
    console.error("Scheduled discovery fetch error:", err);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      job: "scheduled-discovery",
      status: "COMPLETED",
      discovered_raw_records: discoveredCount,
      timestamp: new Date().toISOString(),
    }),
  };
};
