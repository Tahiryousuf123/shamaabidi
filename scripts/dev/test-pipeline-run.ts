// Load .env.local for standalone CLI execution
try {
  process.loadEnvFile('.env.local');
} catch {}

import { runProfessorDiscoveryPipeline } from '../discovery/pipeline';
import { SHAMA_TOPIC_SEEDS } from '../discovery/config';

async function main() {
  console.log('================================================================');
  console.log('STARTING PROFESSOR DISCOVERY TEST RUN ACROSS ALL 9 FREE SOURCES');
  console.log('================================================================\n');

  const topic = 'antimicrobial stewardship';
  console.log(`Topic Seed: "${topic}"`);
  console.log('Date Window: Last 3 years (2023 - 2026)\n');

  const startTime = Date.now();
  const result = await runProfessorDiscoveryPipeline({
    topic,
    limit: 10,
    dryRun: false, // Save to Firestore and create draft emails
  });
  const durationSec = Math.round((Date.now() - startTime) / 1000);

  console.log('================================================================');
  console.log('1. RESULTS PER SOURCE (DAILY RUN LOG TABLE)');
  console.log('================================================================');
  console.log(
    '| Source Name                       | Queries | Raw | Relevance | Verified | Saved | Status / Errors'
  );
  console.log(
    '|-----------------------------------|---------|-----|-----------|----------|-------|------------------'
  );

  for (const [name, stats] of Object.entries(result.perSourceStats)) {
    const errorStr = stats.errors.length > 0 ? `Errors: ${stats.errors[0].slice(0, 35)}...` : 'Healthy (200 OK)';
    const padName = name.padEnd(33);
    const padQ = String(stats.queriesRun).padStart(7);
    const padRaw = String(stats.rawCandidates).padStart(3);
    const padRel = String(stats.passedRelevance).padStart(9);
    const padVer = String(stats.passedVerification).padStart(8);
    const padSaved = String(stats.saved).padStart(5);
    console.log(
      `| ${padName} | ${padQ} | ${padRaw} | ${padRel} | ${padVer} | ${padSaved} | ${errorStr}`
    );
  }

  console.log('\nPipeline Aggregates:');
  console.log(`- Total Raw Candidates Discovered: ${result.totalRaw}`);
  console.log(`- Total Candidates Passing Relevance (>= 0.35): ${result.totalPassedRelevance}`);
  console.log(`- Total Passing Mandatory Stage 3 Verification: ${result.totalPassedVerification}`);
  console.log(`- Total Saved to CRM (Professors + Email Drafts): ${result.totalSaved}`);
  console.log(`- Run Duration: ${durationSec}s`);

  console.log('\n================================================================');
  console.log('2. TOP 5 FULLY VERIFIED PROFESSORS WITH ALL SCHEMA FIELDS');
  console.log('================================================================');

  const sample5 = result.savedProfessors.slice(0, 5);
  sample5.forEach((p, idx) => {
    console.log(`\n--- PROFESSOR #${idx + 1} ---`);
    console.log(`Name:                   ${p.name}`);
    console.log(`University:             ${p.university}`);
    console.log(`Country:                ${p.country}`);
    console.log(`Email:                  ${p.email || 'null (unverified on public page)'}`);
    console.log(`Email Source URL:       ${p.emailSourceUrl || 'null'}`);
    console.log(`Profile Source URL:     ${p.profileSourceUrl}`);
    console.log(`Evidence Snippet:       ${p.evidenceSnippet}`);
    console.log(`Match Reason:           ${p.matchReason}`);
    console.log(`Funding Available:      ${p.fundingAvailable}`);
    console.log(`Funding Source:         ${p.fundingSource || 'null'}`);
    console.log(`Funding Source URL:     ${p.fundingSourceUrl || 'null'}`);
    console.log(`Funding Classification: ${p.fundingClassification}`);
    console.log(`Relevance Score:        ${p.relevanceScore}%`);
    console.log(`Verification Level:     ${p.verificationLevel}`);
    console.log(`OpenAlex Author ID:     ${p.openAlexAuthorId || 'null'}`);
    console.log(`ORCID:                  ${p.orcid || 'null'}`);
    console.log(`Recent Paper:           ${p.recentPaper}`);
    console.log(`Research Area:          ${p.researchArea}`);
    console.log(`Source URL:             ${p.sourceUrl}`);
    console.log(`Status:                 ${p.status}`);
    console.log(`Discovery Confidence:   ${p.discoveryConfidence}`);
    console.log(`Sources:                ${JSON.stringify(p.sources)}`);
    console.log(`Source Count:           ${p.sourceCount}`);
    console.log(`Source Verified Date:   ${p.sourceVerifiedDate}`);
  });

  console.log('\n================================================================');
  console.log('3. REJECTION LOG (AUDIT TRAIL OF REJECTED/FILTERED CANDIDATES)');
  console.log('================================================================');
  result.rejectionLog.slice(0, 10).forEach((r, idx) => {
    console.log(`[Rejection #${idx + 1}] ${r.name} (${r.institution || 'Unknown'})`);
    console.log(`  Source: ${r.source}`);
    console.log(`  Reason: ${r.reason}`);
  });

  console.log('\nPipeline Test Execution Completed Successfully.');
}

main().catch((err) => {
  console.error('Fatal Pipeline Execution Error:', err);
  process.exit(1);
});
