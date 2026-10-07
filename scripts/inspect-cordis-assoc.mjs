const USER_AGENT = 'PhDReach/2.0 (mailto:shamaabidiphd@gmail.com)';

async function inspectCordisRelations() {
  const cordisUrl = 'https://cordis.europa.eu/search/en?q=antimicrobial+stewardship&p=1&num=1&type=project&format=json';
  const res = await fetch(cordisUrl, { headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' } });
  const data = await res.json();
  const project = data?.hits?.hit?.[0]?.project;
  console.log('Project relations keys:', Object.keys(project?.relations || {}));
  console.log('Project relations full:', JSON.stringify(project?.relations, null, 2));
  // What is the project page URL?
  const rcn = project?.rcn;
  console.log(`CORDIS project URL: https://cordis.europa.eu/project/id/${project?.id}`);
}

inspectCordisRelations().catch(console.error);
