const fetch = globalThis.fetch;

async function checkPmcid(pmcid, label) {
  console.log('================================================================');
  console.log(`Checking ${label} (PMCID: ${pmcid})`);
  const xmlRes = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`);
  const xml = await xmlRes.text();

  const anMatch = xml.match(/<author-notes[\s\S]*?<\/author-notes>/i);
  console.log('\n--- JATS <author-notes> ---');
  console.log(anMatch ? anMatch[0] : 'None');

  const contribs = xml.match(/<contrib[\s\S]*?<\/contrib>/gi) || [];
  console.log(`\n--- JATS <contrib> items (Total: ${contribs.length}) ---`);
  contribs.forEach((c, idx) => {
    console.log(`\nContrib #${idx + 1}:`);
    console.log(c);
  });
}

async function run() {
  await checkPmcid('PMC13295964', 'Ilke Adam paper');
}

run();
