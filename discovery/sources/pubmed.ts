import { DiscoveryQuery, DiscoveryCandidate, DiscoverySourceModule } from '../types';
import { SOURCES_CONFIG, getDateWindow, isTargetRegion } from '../config';
import { resilientFetchJson, resilientFetchText } from '../http';

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

interface ESearchResult {
  esearchresult?: {
    idlist?: string[];
  };
}

export const pubmedSource: DiscoverySourceModule = {
  name: 'PubMed (NCBI E-utilities)',
  config: SOURCES_CONFIG.pubmed,
  search: async ({ topic, dateFrom, regions, limit = 20 }: DiscoveryQuery): Promise<DiscoveryCandidate[]> => {
    if (!pubmedSource.config.enabled) return [];

    const apiKey = (process.env.NCBI_API_KEY || '').trim();
    const dateWin = getDateWindow(3);
    const minDate = dateFrom ? dateFrom.slice(0, 4) : String(dateWin.fromYear);
    const maxDate = String(dateWin.toYear);

    const termQuery = `${topic}[tiab]`;
    const searchParams = new URLSearchParams({
      db: 'pubmed',
      term: termQuery,
      mindate: minDate,
      maxdate: maxDate,
      datetype: 'pdat',
      retmode: 'json',
      retmax: String(Math.min(limit * 2, 40)),
      sort: 'pub_date',
    });
    if (apiKey) searchParams.append('api_key', apiKey);

    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${searchParams.toString()}`;
    const searchRes = await resilientFetchJson<ESearchResult>(searchUrl, {
      delayMs: pubmedSource.config.delayMs,
    });

    const idList = searchRes.data?.esearchresult?.idlist || [];
    if (idList.length === 0) return [];

    // Fetch XML for returned IDs
    const fetchParams = new URLSearchParams({
      db: 'pubmed',
      id: idList.slice(0, limit).join(','),
      retmode: 'xml',
    });
    if (apiKey) fetchParams.append('api_key', apiKey);

    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${fetchParams.toString()}`;
    const fetchRes = await resilientFetchText(fetchUrl, {
      delayMs: pubmedSource.config.delayMs,
    });

    const xml = fetchRes.text;
    const candidates: DiscoveryCandidate[] = [];

    // Parse PubmedArticle blocks
    const articleBlocks = xml.split(/<PubmedArticle\b[^>]*>/).slice(1);

    for (const block of articleBlocks) {
      const pmidMatch = block.match(/<PMID[^>]*>(\d+)<\/PMID>/);
      const pmid = pmidMatch ? pmidMatch[1] : '';

      const titleMatch = block.match(/<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'Unknown Paper';

      const yearMatch = block.match(/<JournalIssue[^>]*>[\s\S]*?<Year>(\d{4})<\/Year>/) || block.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : dateWin.toYear;

      const doiMatch = block.match(/<ELocationID\s+EIdType="doi"[^>]*>([^<]+)<\/ELocationID>/) || block.match(/<ArticleId\s+IdType="doi"[^>]*>([^<]+)<\/ArticleId>/);
      const doi = doiMatch ? doiMatch[1].trim() : undefined;

      // Extract authors
      const authorListMatch = block.match(/<AuthorList[^>]*>([\s\S]*?)<\/AuthorList>/);
      if (!authorListMatch) continue;

      const authorRegex = /<Author\b[^>]*>([\s\S]*?)<\/Author>/g;
      let aMatch: RegExpExecArray | null;
      const parsedAuthors: Array<{
        name: string;
        affiliation: string;
        email: string | null;
        orcid: string | null;
      }> = [];

      while ((aMatch = authorRegex.exec(authorListMatch[1])) !== null) {
        const aText = aMatch[1];
        const last = (aText.match(/<LastName>([^<]+)<\/LastName>/) || [])[1] || '';
        const fore = (aText.match(/<ForeName>([^<]+)<\/ForeName>/) || [])[1] || '';
        const name = `${fore} ${last}`.trim();
        if (!name) continue;

        const orcidMatch = aText.match(/<Identifier\s+Source="ORCID"[^>]*>([^<]+)<\/Identifier>/);
        const orcid = orcidMatch ? orcidMatch[1].replace(/^(https?:\/\/)?orcid\.org\//, '').trim() : null;

        const affMatch = aText.match(/<Affiliation>([\s\S]*?)<\/Affiliation>/);
        const affiliation = affMatch ? affMatch[1].replace(/\s+/g, ' ').trim() : '';

        // Extract email ONLY if literally present
        let email: string | null = null;
        if (affiliation) {
          const em = affiliation.match(EMAIL_REGEX);
          if (em) {
            email = em[0].toLowerCase().trim().replace(/[.,;)]+$/, '');
          }
        }

        parsedAuthors.push({ name, affiliation, email, orcid });
      }

      if (parsedAuthors.length === 0) continue;

      // Target last author and corresponding author (with email)
      const corresponding = parsedAuthors.find((a) => a.email !== null);
      const lastAuthor = parsedAuthors[parsedAuthors.length - 1];

      const targets = [corresponding, lastAuthor].filter(Boolean) as typeof parsedAuthors;
      const seenNames = new Set<string>();

      for (const author of targets) {
        if (seenNames.has(author.name)) continue;
        seenNames.add(author.name);

        // Check if affiliation matches target region
        if (author.affiliation && !isTargetRegion(author.affiliation, false)) {
          continue;
        }

        // Parse institution from affiliation
        const institution = author.affiliation
          ? author.affiliation.split(',')[0].replace(/electronic address:.*$/i, '').trim()
          : 'Academic Institution';

        const sourceUrl = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : (doi ? `https://doi.org/${doi}` : 'https://pubmed.ncbi.nlm.nih.gov/');

        candidates.push({
          name: author.name,
          institution,
          country: author.affiliation.split(',').pop()?.trim() || 'Target Region',
          orcid: author.orcid,
          openalexId: null,
          email: author.email,
          emailSourceUrl: author.email ? sourceUrl : null,
          sourceName: pubmedSource.name,
          sourceUrl,
          evidence: {
            paperTitle: title,
            doi,
            year,
          },
        });
      }
    }

    return candidates;
  },
};
