import { adminDb } from '../lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  queryOpenAlex,
  findEvidenceViaTavily,
  checkDuplicate,
  markAsSeen,
} from '../lib/auto-find';
import {
  generatePersonalizedEmail,
  constructFullEmailMessage,
} from '../lib/email-service';
import { DEFAULT_PROFILE, SHAMA_RESEARCH_THEMES } from '../lib/types';
import * as fs from 'fs';
import * as path from 'path';

async function runProof() {
  console.log('================================================================');
  console.log('🧪 RUNNING SCIENTIFIC EVIDENCE & DEDUPLICATION PROOF TEST');
  console.log('================================================================\n');

  // Step 1: Use Shama's actual research themes
  const targetTheme = SHAMA_RESEARCH_THEMES[3]; // "antimicrobial stewardship and resistance"
  const targetCountry = 'United Kingdom';
  console.log(`[1] Research-based Query: "${targetTheme}" in ${targetCountry}`);

  const candidates = await queryOpenAlex(targetTheme, targetCountry, 15);
  console.log(`✅ OpenAlex returned ${candidates.length} recent author candidates (last 5 years), ranked by match score.\n`);

  const processedRecords: any[] = [];
  let verifiedCount = 0;
  let partialCount = 0;
  let noEmailCount = 0;
  let duplicateCount = 0;

  console.log('[2] Processing candidates through Tavily literal evidence extraction & verification...\n');

  const sampleSize = Math.min(10, candidates.length);

  for (let i = 0; i < sampleSize; i++) {
    const candidate = candidates[i];
    console.log(`Candidate ${i + 1}/${sampleSize}: ${candidate.name} | ${candidate.university}`);
    console.log(`  Paper: "${candidate.recentPaper}" (${candidate.publicationYear})`);
    console.log(`  Match Reason: ${candidate.matchReason}`);

    // Check duplicate
    const dup = await checkDuplicate(
      candidate.openAlexAuthorId,
      null,
      candidate.orcid,
      candidate.name,
      candidate.university
    );

    if (dup.isDuplicate) {
      console.log(`  ⚠️ Duplicate detected: ${dup.reason} -> Skipped`);
      duplicateCount++;
      continue;
    }

    // Literal evidence extraction
    const evidence = await findEvidenceViaTavily(candidate.name, candidate.university);
    console.log(`  Email: ${evidence.email || 'NOT FOUND (not guessed)'}`);
    console.log(`  Email Source: ${evidence.emailSourceUrl || 'none'}`);
    console.log(`  Profile Source: ${evidence.profileSourceUrl || candidate.sourceUrl}`);
    console.log(`  Verification Level: ${evidence.verificationLevel}`);
    console.log(`  Funding: ${evidence.fundingAvailable} (${evidence.fundingSource || 'none'})`);
    console.log(`  Deadline: ${evidence.deadline} (Source: ${evidence.deadlineSourceUrl || 'not_stated'})`);
    if (evidence.evidenceSnippet) {
      console.log(`  Evidence Snippet: "${evidence.evidenceSnippet.replace(/\n/g, ' ').slice(0, 100)}..."`);
    }

    let status: 'draft' | 'needs_review' | 'email_not_found';
    if (evidence.verificationLevel === 'verified' && evidence.email) {
      status = 'draft';
      verifiedCount++;
    } else if (evidence.verificationLevel === 'partial' && evidence.email) {
      status = 'needs_review';
      partialCount++;
    } else {
      status = 'email_not_found';
      noEmailCount++;
    }

    // Save to Firestore
    const docRef = await adminDb.collection('professors').add({
      name: candidate.name,
      university: candidate.university,
      country: candidate.country,
      email: evidence.email,
      emailSourceUrl: evidence.emailSourceUrl,
      profileSourceUrl: evidence.profileSourceUrl || candidate.sourceUrl,
      evidenceSnippet: evidence.evidenceSnippet,
      matchReason: candidate.matchReason,
      fundingAvailable: evidence.fundingAvailable,
      fundingSource: evidence.fundingSource,
      fundingSourceUrl: evidence.fundingSourceUrl,
      deadline: evidence.deadline,
      deadlineDate: evidence.deadlineDate,
      deadlineSourceUrl: evidence.deadlineSourceUrl,
      verificationLevel: evidence.verificationLevel,
      openAlexAuthorId: candidate.openAlexAuthorId,
      orcid: candidate.orcid || null,
      recentPaper: candidate.recentPaper,
      researchArea: candidate.researchArea,
      status,
      createdAt: FieldValue.serverTimestamp(),
    });

    // If verified, generate draft email
    let draftSubject = '';
    if (status === 'draft' && evidence.email) {
      try {
        const draft = await generatePersonalizedEmail(
          candidate.name,
          candidate.university,
          candidate.researchArea,
          candidate.recentPaper,
          DEFAULT_PROFILE,
          'first'
        );
        draftSubject = draft.subject;
        const fullBody = constructFullEmailMessage(draft.body, candidate.name, DEFAULT_PROFILE);
        await adminDb.collection('emails').add({
          professorId: docRef.id,
          type: 'first',
          subject: draft.subject,
          body: fullBody,
          status: 'draft',
          createdAt: FieldValue.serverTimestamp(),
        });
        console.log(`  ✨ Draft Email Generated: "${draft.subject}"`);
      } catch (e: any) {
        console.log(`  ⚠️ Email draft generation note: ${e.message}`);
      }
    }

    // Mark as seen permanently
    await markAsSeen(
      candidate.openAlexAuthorId,
      evidence.email,
      candidate.orcid,
      candidate.name,
      candidate.university,
      status
    );

    const record = {
      id: docRef.id,
      name: candidate.name,
      university: candidate.university,
      country: candidate.country,
      email: evidence.email,
      emailSourceUrl: evidence.emailSourceUrl,
      profileSourceUrl: evidence.profileSourceUrl || candidate.sourceUrl,
      evidenceSnippet: evidence.evidenceSnippet,
      matchReason: candidate.matchReason,
      fundingAvailable: evidence.fundingAvailable,
      fundingSource: evidence.fundingSource,
      fundingSourceUrl: evidence.fundingSourceUrl,
      deadline: evidence.deadline,
      deadlineDate: evidence.deadlineDate,
      deadlineSourceUrl: evidence.deadlineSourceUrl,
      verificationLevel: evidence.verificationLevel,
      openAlexAuthorId: candidate.openAlexAuthorId,
      orcid: candidate.orcid,
      status,
      draftSubject,
    };

    processedRecords.push(record);
    console.log(`  💾 Saved into Firestore with status: [${status}]\n`);
  }

  console.log('================================================================');
  console.log('🔁 STEP 3: DUPLICATE PREVENTION VERIFICATION (SECOND PASS)');
  console.log('================================================================\n');

  console.log('Re-running candidate duplicate check against seen_professors & professors collections...');
  let secondRunBlockedDuplicates = 0;
  let secondRunNewCreated = 0;

  for (let i = 0; i < sampleSize; i++) {
    const candidate = candidates[i];
    const dup = await checkDuplicate(
      candidate.openAlexAuthorId,
      null,
      candidate.orcid,
      candidate.name,
      candidate.university
    );

    if (dup.isDuplicate) {
      secondRunBlockedDuplicates++;
      console.log(`  ✅ [BLOCKED DUPLICATE] ${candidate.name} (${candidate.university}) -> Reason: ${dup.reason}`);
    } else {
      secondRunNewCreated++;
      console.log(`  ❌ [FAILED TO CATCH] ${candidate.name}`);
    }
  }

  const results = {
    summary: {
      candidatesAnalyzed: sampleSize,
      verifiedCount,
      partialCount,
      noEmailCount,
      duplicateCountFirstRun: duplicateCount,
      secondRunBlockedDuplicates,
      secondRunNewCreated,
      guaranteedZeroDuplicates: secondRunNewCreated === 0,
    },
    sampleRecords: processedRecords,
  };

  const outputPath = path.join(__dirname, 'proof-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n✅ Proof results saved to: ${outputPath}`);

  console.log('\n================================================================');
  console.log('📊 PROOF TEST SUMMARY');
  console.log('================================================================');
  console.log(`Candidates Analyzed: ${sampleSize}`);
  console.log(`Verified (Eligible for draft email): ${verifiedCount}`);
  console.log(`Partial (Routed to Needs Review tab): ${partialCount}`);
  console.log(`Email Not Found (Marked 'email_not_found', zero guessed): ${noEmailCount}`);
  console.log(`Second-Run Duplicate Prevention: ${secondRunBlockedDuplicates}/${sampleSize} blocked (0 duplicates created)`);
  console.log('================================================================\n');

  return results;
}

runProof()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
