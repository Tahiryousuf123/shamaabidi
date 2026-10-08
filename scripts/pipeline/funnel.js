const fs = require('fs');
const { db, FieldValue } = require('./db');
const { DAILY_TARGET } = require('./config');

async function getBacklogCounts() {
  const statuses = ['discovered', 'email_found', 'needs_review', 'verified', 'drafted', 'no_email', 'rejected', 'bounced'];
  const counts = {};

  for (const st of statuses) {
    try {
      const snap = await db.collection('candidates').where('status', '==', st).count().get();
      counts[st] = snap.data().count;
    } catch {
      try {
        const snap = await db.collection('candidates').where('status', '==', st).get();
        counts[st] = snap.size;
      } catch {
        counts[st] = 0;
      }
    }
  }

  return counts;
}

async function getYieldProjections(backlog, runData = {}) {
  let totalDiscovered = 0;
  let totalDrafted = 0;
  let totalAttempted = 0;
  let totalEmailFound = 0;
  let totalVerified = 0;
  let runCount = 0;

  try {
    const runsSnap = await db.collection('runs').get();
    const validRuns = runsSnap.docs
      .map((d) => d.data())
      .filter((d) => d && (d.discovered_new !== undefined || d.drafted !== undefined) && d.dryRun !== true)
      .sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.timestamp || 0).getTime();
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      })
      .slice(0, 7);

    runCount = validRuns.length;
    for (const r of validRuns) {
      totalDiscovered += (r.discovered_new || 0);
      totalDrafted += (r.drafted || 0);
      totalAttempted += (r.email_attempted || 0);
      totalEmailFound += (r.email_found || 0);
      totalVerified += (r.verify_passed || 0);
    }
  } catch (err) {
    console.warn('   [Funnel] Could not query runs collection for projections:', err.message);
  }

  // Include current run metrics if available
  if (runData.email_attempted) totalAttempted += runData.email_attempted;
  if (runData.email_found) totalEmailFound += runData.email_found;
  if (runData.verify_passed) totalVerified += runData.verify_passed;
  if (runData.discovered_new) totalDiscovered += runData.discovered_new;
  if (runData.drafted) totalDrafted += runData.drafted;

  const candidatesPerDraft = totalDrafted > 0 
    ? (totalDiscovered / totalDrafted).toFixed(1)
    : 'n/a, no drafts yet';

  // Conversion rates: (email_found / attempted) * (verified / email_found)
  const emailRate = totalAttempted > 0 ? Math.min(1.0, totalEmailFound / totalAttempted) : 0.50;
  const rawVerifyRate = totalEmailFound > 0 && totalVerified > 0 ? (totalVerified / totalEmailFound) : 0.85;
  const verifyRate = Math.min(1.0, rawVerifyRate);
  const netConversion = emailRate * verifyRate;

  const discoveredBacklog = backlog.discovered || 0;
  const emailFoundBacklog = backlog.email_found || 0;
  const verifiedBacklog = backlog.verified || 0;

  // Projected drafts from backlog: backlog * (email_found/attempted) * (verified/email_found)
  const projectedDraftsFromDiscovered = discoveredBacklog * netConversion;
  const projectedDraftsFromEmailFound = emailFoundBacklog * verifyRate;
  const projectedDrafts = Math.round(verifiedBacklog + projectedDraftsFromEmailFound + projectedDraftsFromDiscovered);

  const daysOfRunway = DAILY_TARGET > 0 ? (projectedDrafts / DAILY_TARGET).toFixed(1) : '0';

  return {
    runCount,
    totalDiscovered,
    totalDrafted,
    candidatesPerDraft,
    emailRatePct: (emailRate * 100).toFixed(1) + '%',
    verifyRatePct: (verifyRate * 100).toFixed(1) + '%',
    netConversionPct: (netConversion * 100).toFixed(1) + '%',
    projectedDrafts,
    dailyTarget: DAILY_TARGET,
    daysOfRunway,
  };
}

async function recordAndPrintFunnel(runData, options = {}) {
  const isDryRun = Boolean(options.dryRun);
  const backlog = await getBacklogCounts();
  const projections = await getYieldProjections(backlog, runData);

  const sourceDiagnostics = runData.source_diagnostics || {
    pubmed: { attempted: 0, found: 0, failed: 0, skipped: 0, http_errors: 0 },
    'pmc-fulltext': { attempted: 0, found: 0, failed: 0, skipped_no_pmcid: 0, http_errors: 0 },
    'core-fulltext': { attempted: 0, found: 0, failed: 0, skipped: 0, http_errors: 0 },
    orcid: { attempted: 0, found: 0, failed: 0, skipped: 0, http_errors: 0, failure_reasons: {} },
    'faculty-page': { attempted: 0, found: 0, failed: 0, skipped: 0, http_errors: 0, failure_reasons: {} },
  };

  const generatorCounts = runData.generator_counts || { groq: 0, gemini: 0, template: 0 };

  const funnel = {
    timestamp: new Date().toISOString(),
    stage: options.stage || 'all',
    dryRun: isDryRun,
    limit: options.limit || 20,
    discovered_new: runData.discovered_new || 0,
    email_attempted: runData.email_attempted || 0,
    email_found: runData.email_found || 0,
    email_found_by_source: runData.email_found_by_source || {},
    source_diagnostics: sourceDiagnostics,
    author_mismatch_reassigned: runData.author_mismatch_reassigned || 0,
    no_email: runData.no_email || 0,
    verify_passed: runData.verify_passed || 0,
    verify_rejected: runData.verify_rejected || 0,
    verify_rejected_by_reason: runData.verify_rejected_by_reason || {},
    orcid_domain_mismatches: runData.orcid_domain_mismatches || 0,
    drafted: runData.drafted || 0,
    skipped_dup: runData.skipped_dup || 0,
    failed: runData.failed || 0,
    generator_counts: generatorCounts,
    backlog_by_status: backlog,
    yield_projections: projections,
  };

  // 1. Console Output
  console.log(`\n================================================================`);
  console.log(`📊 PIPELINE FUNNEL & OBSERVABILITY REPORT`);
  console.log(`================================================================`);
  console.log(`⏱️  Timestamp: ${funnel.timestamp}`);
  console.log(`🎯 Executed Stage: ${funnel.stage} (Dry Run: ${funnel.dryRun})`);
  console.log(`----------------------------------------------------------------`);
  console.log(`📡 1. Discovery:`);
  console.log(`   - New Discovered:           ${funnel.discovered_new}`);
  console.log(`📬 2. Email Resolution:`);
  console.log(`   - Candidates Attempted:     ${funnel.email_attempted}`);
  console.log(`   - Emails Found:             ${funnel.email_found}`);
  for (const [src, cnt] of Object.entries(funnel.email_found_by_source)) {
    console.log(`     * ${src}: ${cnt}`);
  }
  console.log(`   - Author Mismatches Reassigned: ${funnel.author_mismatch_reassigned}`);
  console.log(`   - No Email Found:           ${funnel.no_email}`);

  console.log(`\n🔬 Source Resolution Diagnostics:`);
  const diagTable = Object.entries(funnel.source_diagnostics).map(([src, stats]) => {
    const skipped = stats.skipped_no_pmcid !== undefined ? stats.skipped_no_pmcid : (stats.skipped || 0);
    const yieldPct = stats.attempted > 0 ? ((stats.found / stats.attempted) * 100).toFixed(1) + '%' : '0.0%';
    const failureSummary = stats.failure_reasons && Object.keys(stats.failure_reasons).length > 0
      ? Object.entries(stats.failure_reasons).map(([k, v]) => `${k}:${v}`).join(' ')
      : '-';
    return {
      'Source': src,
      'Attempted': stats.attempted,
      'Found': stats.found,
      'Failed': stats.failed,
      'Skipped': skipped,
      'HTTP Errors': stats.http_errors,
      'Yield (%)': yieldPct,
      'Failure Reasons': failureSummary,
    };
  });
  console.table(diagTable);

  console.log(`----------------------------------------------------------------`);
  console.log(`🛡️ 3. Verification:`);
  console.log(`   - Passed:                   ${funnel.verify_passed}`);
  console.log(`   - ORCID Domain Mismatches:  ${funnel.orcid_domain_mismatches}`);
  console.log(`   - Rejected:                 ${funnel.verify_rejected}`);
  for (const [rs, cnt] of Object.entries(funnel.verify_rejected_by_reason)) {
    console.log(`     * ${rs}: ${cnt}`);
  }
  console.log(`----------------------------------------------------------------`);
  console.log(`✉️ 4. Drafting:`);
  console.log(`   - Drafts Created:           ${funnel.drafted}`);
  console.log(`   - Skipped Duplicates:       ${funnel.skipped_dup}`);
  console.log(`   - Drafting Failures:        ${funnel.failed}`);
  console.log(`   - Generators Used:          Groq: ${generatorCounts.groq || 0} | Gemini: ${generatorCounts.gemini || 0} | Template: ${generatorCounts.template || 0}`);
  console.log(`----------------------------------------------------------------`);
  console.log(`⚖️ FUNNEL RECONCILIATION (Stage Balance Check):`);
  const directFound = Math.max(0, funnel.email_found - (funnel.author_mismatch_reassigned || 0));
  const reassignedFound = funnel.author_mismatch_reassigned || 0;
  const noEmail = funnel.no_email || 0;
  const skippedOther = Math.max(0, funnel.discovered_new - (directFound + reassignedFound + noEmail));
  const candPerDraft = funnel.drafted > 0 ? (funnel.discovered_new / funnel.drafted).toFixed(1) : 'N/A';
  console.log(`   • Discovered [N = ${funnel.discovered_new}] = Direct Found [${directFound}] + Reassigned [${reassignedFound}] + No Email [${noEmail}] + Skipped/Other [${skippedOther}]`);
  console.log(`   • Candidates needed per draft (this run): ${candPerDraft} (${funnel.discovered_new} discovered / ${funnel.drafted} drafts)`);
  console.log(`   • Backlog Architecture: In-memory dry-run holds volatile candidate state; Firestore holds persistent collection 'candidates'.`);

  if (runData.ai_errors && runData.ai_errors.length > 0) {
    console.log(`----------------------------------------------------------------`);
    console.log(`🤖 AI GENERATION ERROR AUDIT (${runData.ai_errors.length} model errors logged):`);
    console.table(runData.ai_errors.map((e) => ({
      Timestamp: e.timestamp?.slice(11, 19) || '',
      Candidate: (e.candidateName || 'Unknown').slice(0, 20),
      Model: e.model,
      Status: e.statusCode,
      Error: (e.errorBody || '').slice(0, 50),
    })));
  }
  console.log(`----------------------------------------------------------------`);
  console.log(`🗃️ Current Candidate Backlog:`);
  for (const [st, cnt] of Object.entries(funnel.backlog_by_status)) {
    console.log(`   - [${st}]: ${cnt}`);
  }
  console.log(`----------------------------------------------------------------`);
  console.log(`📈 5. Yield & Runway Projections (Last 7 runs, target: ${projections.dailyTarget}/day):`);
  console.log(`   - Candidates needed/draft:  ${projections.candidatesPerDraft}`);
  console.log(`   - Discovered in window:     ${projections.totalDiscovered} across ${projections.runCount} runs`);
  console.log(`   - Drafted in window:        ${projections.totalDrafted}`);
  console.log(`   - Conversion rates:         Email yield: ${projections.emailRatePct} | Verify rate: ${projections.verifyRatePct} (Net: ${projections.netConversionPct})`);
  console.log(`   - Projected drafts left:    ~${projections.projectedDrafts} drafts across backlog`);
  console.log(`   - Estimated runway:         ~${projections.daysOfRunway} days at current DAILY_TARGET`);
  console.log(`================================================================\n`);

  // 2. Write to GITHUB_STEP_SUMMARY if available
  const stepSummaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummaryFile) {
    try {
      const diagRows = Object.entries(funnel.source_diagnostics).map(([src, stats]) => {
        const skipped = stats.skipped_no_pmcid !== undefined ? stats.skipped_no_pmcid : (stats.skipped || 0);
        const yieldPct = stats.attempted > 0 ? ((stats.found / stats.attempted) * 100).toFixed(1) + '%' : '0.0%';
        const failureSummary = stats.failure_reasons && Object.keys(stats.failure_reasons).length > 0
          ? Object.entries(stats.failure_reasons).map(([k, v]) => `${k}:${v}`).join(' ')
          : '-';
        return `| \`${src}\` | ${stats.attempted} | ${stats.found} | ${stats.failed} | ${skipped} | ${stats.http_errors} | **${yieldPct}** | ${failureSummary} |`;
      }).join('\n');

      const totalGens = (generatorCounts.groq || 0) + (generatorCounts.gemini || 0) + (generatorCounts.template || 0);
      const groqPct = totalGens > 0 ? (((generatorCounts.groq || 0) / totalGens) * 100).toFixed(1) + '%' : '0%';
      const geminiPct = totalGens > 0 ? (((generatorCounts.gemini || 0) / totalGens) * 100).toFixed(1) + '%' : '0%';
      const templatePct = totalGens > 0 ? (((generatorCounts.template || 0) / totalGens) * 100).toFixed(1) + '%' : '0%';

      const markdown = `
## 🚀 PhD Outreach Pipeline Run Funnel

| Metric | Count | Details |
|---|---|---|
| **Discovered New** | **${funnel.discovered_new}** | OpenAlex works query (senior authors prioritized) |
| **Email Attempted** | ${funnel.email_attempted} | Multi-tier cascading resolution |
| **Email Found** | **${funnel.email_found}** | ${Object.entries(funnel.email_found_by_source).map(([k, v]) => `${k}: ${v}`).join(', ') || 'N/A'} |
| **No Email** | ${funnel.no_email} | Logged with retry backoff |
| **Verification Passed** | **${funnel.verify_passed}** | DNS MX + name matched |
| **ORCID Domain Mismatches** | ${funnel.orcid_domain_mismatches} | Flagged & deprioritized |
| **Verification Rejected** | ${funnel.verify_rejected} | ${Object.entries(funnel.verify_rejected_by_reason).map(([k, v]) => `${k}: ${v}`).join(', ') || 'N/A'} |
| **Drafted (Gmail IMAP)** | **${funnel.drafted}** | CV attached, AI personalized |
| **Skipped Duplicates** | ${funnel.skipped_dup} | Email / name+institution dedupe |
| **Drafting Failures** | **${funnel.failed}** | Logged & claim released |

### 🔬 Email Source Resolution Diagnostics
| Source | Attempted | Found | Failed | Skipped | HTTP Errors | Yield (%) | Failure Reasons |
|---|---|---|---|---|---|---|---|
${diagRows}

### 🤖 AI Email Generator Counts
| Generator | Count | Share (%) |
|---|---|---|
| Groq | ${generatorCounts.groq || 0} | ${groqPct} |
| Gemini | ${generatorCounts.gemini || 0} | ${geminiPct} |
| Template | ${generatorCounts.template || 0} | ${templatePct} |


### 🗃️ Backlog Status
| Status | Active Count |
|---|---|
| \`discovered\` | ${funnel.backlog_by_status.discovered || 0} |
| \`email_found\` | ${funnel.backlog_by_status.email_found || 0} |
| \`verified\` | ${funnel.backlog_by_status.verified || 0} |
| \`drafted\` | ${funnel.backlog_by_status.drafted || 0} |
| \`no_email\` | ${funnel.backlog_by_status.no_email || 0} |
| \`rejected\` | ${funnel.backlog_by_status.rejected || 0} |
| \`bounced\` | ${funnel.backlog_by_status.bounced || 0} |

### 📈 Yield & Runway Projections (Last 7 Runs)
- **Candidates needed per draft:** \`${projections.candidatesPerDraft}\`
- **Discovered in window:** \`${projections.totalDiscovered}\` across \`${projections.runCount}\` runs
- **Drafted in window:** \`${projections.totalDrafted}\`
- **Conversion rates:** Email yield: \`${projections.emailRatePct}\` | Verify rate: \`${projections.verifyRatePct}\` (Net: \`${projections.netConversionPct}\`)
- **Projected drafts left:** \`~${projections.projectedDrafts} drafts\` (computed from backlog conversion rates)
- **Estimated runway:** \`~${projections.daysOfRunway} days\` at \`${projections.dailyTarget}/day\`

\`\`\`json
${JSON.stringify(funnel, null, 2)}
\`\`\`
`;
      fs.appendFileSync(stepSummaryFile, markdown);
    } catch (summaryErr) {
      console.warn('Could not write to GITHUB_STEP_SUMMARY:', summaryErr.message);
    }
  }

  // 3. Save run report to Firestore runs collection (Live runs ONLY)
  if (!isDryRun) {
    try {
      await db.collection('runs').add({
        ...funnel,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (saveErr) {
      console.warn('Could not persist run summary to Firestore:', saveErr.message);
    }
  }

  return funnel;
}


module.exports = {
  getBacklogCounts,
  recordAndPrintFunnel,
};
