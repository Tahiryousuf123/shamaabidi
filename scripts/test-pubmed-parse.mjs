const USER_AGENT = 'PhDReach/2.0 (mailto:shamaabidiphd@gmail.com)';

async function testPubMedParse() {
  const pmid = '42838857';
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const xml = await res.text();
  console.log('PubMed XML snippet (first 1000 chars):');
  console.log(xml.slice(0, 1000));
}

testPubMedParse().catch(console.error);
