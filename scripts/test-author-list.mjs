const USER_AGENT = 'PhDReach/2.0 (mailto:shamaabidiphd@gmail.com)';

async function testAuthorList() {
  const pmid = '42838857';
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const xml = await res.text();
  const authorMatch = xml.match(/<AuthorList[^>]*>([\s\S]*?)<\/AuthorList>/);
  if (authorMatch) {
    console.log('AuthorList sample (first 1500 chars):');
    console.log(authorMatch[1].slice(0, 1500));
  } else {
    console.log('No AuthorList found');
  }
}

testAuthorList().catch(console.error);
