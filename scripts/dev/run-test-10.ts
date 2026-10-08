import {
  extractLiteralAdDetails,
  evaluateFundedAd,
  findSupervisorOfficialEmail,
  FUNDED_PHD_DOMAINS,
  FUNDED_PHD_TOPICS,
  ExtractedAdDetails,
  EvaluatedAdResult,
} from '../lib/auto-find';

async function runTest10() {
  console.log('================================================================');
  console.log('🎯 FUNDING-FIRST DISCOVERY PIPELINE TEST (10 RESULTS AUDIT)');
  console.log('================================================================\n');

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.error('TAVILY_API_KEY is not set. Please supply it via .env.local');
    return;
  }

  console.log('Search Topics:', FUNDED_PHD_TOPICS.join(', '));
  console.log('Include Domains:', FUNDED_PHD_DOMAINS.join(', '));
  console.log('');

  // 1. Search for live PhD advertisements across target domains & topics
  const queries = [
    'site:findaphd.com/phds/project ("funded" OR "studentship") ("antimicrobial" OR "clinical pharmacy" OR "medication safety")',
    'site:jobs.ac.uk/job "PhD Studentship" ("pharmacy" OR "antimicrobial stewardship" OR "medication safety")',
    'site:findaphd.com/phds/project ("fully funded" OR "scholarship") ("digital health" OR "clinical decision support" OR "health services")',
  ];

  const searchResults: Array<{ title: string; url: string; content: string }> = [];
  const seenUrls = new Set<string>();

  for (const q of queries) {
    if (searchResults.length >= 15) break;
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: q,
          search_depth: 'advanced',
          max_results: 8,
        }),
      });
      const data = await res.json();
      for (const item of data.results || []) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          searchResults.push({
            title: item.title || '',
            url: item.url,
            content: item.content || '',
          });
        }
      }
    } catch (e) {
      console.error('Tavily search error:', e);
    }
  }

  console.log(`Found ${searchResults.length} unique PhD advertisement candidates. Processing exactly 10...\n`);

  const resultsToProcess = searchResults.slice(0, 10);
  const auditResults: Array<{
    ad: ExtractedAdDetails;
    accepted: boolean;
    rejectionReason?: string;
    relevanceScore: number;
    matchReason: string;
    verifiedEmail: string | null;
    emailSourceUrl: string | null;
    verificationLevel: 'verified' | 'unverified';
  }> = [];

  let acceptedCount = 0;
  let rejectedCount = 0;

  for (let i = 0; i < resultsToProcess.length; i++) {
    const raw = resultsToProcess[i];
    console.log(`------------------------------------------------------------`);
    console.log(`[Result ${i + 1}/10] Extracting & Evaluating: ${raw.title}`);
    console.log(`Source URL: ${raw.url}`);

    // If content snippet is brief, extract full page
    let contentToUse = raw.content;
    if (
      (raw.url.includes('findaphd.com') ||
        raw.url.includes('jobs.ac.uk') ||
        raw.url.includes('euraxess.ec.europa.eu')) &&
      contentToUse.length < 3000
    ) {
      try {
        const extRes = await fetch('https://api.tavily.com/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: apiKey, urls: [raw.url] }),
        });
        if (extRes.ok) {
          const extData = await extRes.json();
          const full = extData.results?.[0]?.raw_content;
          if (full && full.length > contentToUse.length) {
            contentToUse = full;
          }
        }
      } catch {}
    }

    // Step 2: Extract text that literally appears in the ad
    const extracted = await extractLiteralAdDetails(raw.url, raw.title, contentToUse);
    console.log(`  • Supervisor: ${extracted.supervisorName || 'Not stated in ad'}`);
    console.log(`  • University: ${extracted.university || 'Not stated'}`);
    console.log(
      `  • Funding: ${extracted.fundingType || (extracted.isExplicitlyFunded ? 'Funded' : 'Not stated')}${
        extracted.fundingAmount ? ` (${extracted.fundingAmount})` : ''
      }`
    );
    console.log(
      `  • Eligibility: ${extracted.eligibilitySnippet || (extracted.internationalAllowed ? 'International allowed' : 'Restricted')}`
    );
    console.log(`  • Deadline: ${extracted.deadline}`);

    // Step 3 & 4: Evaluate Funding, International Eligibility, and Relevance (> 60)
    const evalRes = evaluateFundedAd(extracted);

    let verifiedEmail: string | null = null;
    let emailSourceUrl: string | null = null;
    let verificationLevel: 'verified' | 'unverified' = 'unverified';

    if (evalRes.accepted) {
      acceptedCount++;
      console.log(`  ✅ STATUS: ACCEPTED (Relevance Score: ${evalRes.score}/100)`);
      console.log(`  🎯 Match Reason: ${evalRes.matchReason}`);

      // Step 5: Supervisor Email verification (ad email or official university page only)
      const emailRes = await findSupervisorOfficialEmail(
        extracted.supervisorName,
        extracted.university,
        extracted.contactEmail,
        raw.url
      );
      verifiedEmail = emailRes.email;
      emailSourceUrl = emailRes.emailSourceUrl;
      verificationLevel = emailRes.verificationLevel;

      if (verifiedEmail) {
        console.log(`  📧 Verified Email: ${verifiedEmail} (Source: ${emailSourceUrl})`);
      } else {
        console.log(`  ⚠️ Email: Not found on official academic domain (Marked unverified - never guessed)`);
      }
    } else {
      rejectedCount++;
      console.log(`  ❌ STATUS: REJECTED`);
      console.log(`  ⛔ Reason: ${evalRes.rejectionReason}`);
    }

    auditResults.push({
      ad: extracted,
      accepted: evalRes.accepted,
      rejectionReason: evalRes.rejectionReason,
      relevanceScore: evalRes.score,
      matchReason: evalRes.matchReason,
      verifiedEmail,
      emailSourceUrl,
      verificationLevel,
    });
    console.log('');
  }

  console.log('================================================================');
  console.log(`📊 FINAL SUMMARY OF 10 TEST RESULTS`);
  console.log('================================================================');
  console.log(`Total Evaluated: 10`);
  console.log(`Accepted: ${acceptedCount} (Explicit Funding + International Allowed + Relevance > 60)`);
  console.log(`Rejected: ${rejectedCount}\n`);

  auditResults.forEach((res, idx) => {
    console.log(`${idx + 1}. [${res.accepted ? 'ACCEPTED' : 'REJECTED'}] ${res.ad.title}`);
    console.log(`   URL: ${res.ad.adUrl}`);
    if (res.accepted) {
      console.log(`   Supervisor: ${res.ad.supervisorName || 'Team/Department'} | University: ${res.ad.university}`);
      console.log(`   Funding: ${res.ad.fundingType || 'Funded Studentship'}${res.ad.fundingAmount ? ` (${res.ad.fundingAmount})` : ''} | Deadline: ${res.ad.deadline}`);
      console.log(`   Email: ${res.verifiedEmail || 'None found (Unverified)'} [${res.verificationLevel}]`);
      console.log(`   Match Reason: ${res.matchReason}`);
    } else {
      console.log(`   Why Rejected: ${res.rejectionReason}`);
    }
    console.log('');
  });
}

runTest10();
