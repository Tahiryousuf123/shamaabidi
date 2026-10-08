#!/usr/bin/env node
/**
 * Staged, Queue-Based PhD Outreach Pipeline Orchestrator (Adaptive Multi-Round)
 *
 * Usage:
 *   node scripts/run-pipeline.js --stage=all --limit=25 --dry-run
 *   node scripts/run-pipeline.js --stage=discover --limit=60
 *   node scripts/run-pipeline.js --stage=email --limit=40
 *   node scripts/run-pipeline.js --stage=verify --limit=40
 *   node scripts/run-pipeline.js --stage=draft --limit=25
 *   node scripts/run-pipeline.js --stage=bounce
 */

const fs = require('fs');
const path = require('path');
const { db } = require('./pipeline/db');
const {
  DAILY_TARGET,
  DAILY_MIN,
  DAILY_MAX,
  GLOBAL_BUDGET_MIN,
  DISCOVER_MAX,
  EMAIL_MAX,
  VERIFY_MAX,
} = require('./pipeline/config');

const { runStage1Discover } = require('./pipeline/stage1-discover');
const { runStage2Email } = require('./pipeline/stage2-email');
const { runStage3Verify } = require('./pipeline/stage3-verify');
const { runStage4Draft } = require('./pipeline/stage4-draft');
const { runStage5Bounce } = require('./pipeline/stage5-bounce');
const { recordAndPrintFunnel } = require('./pipeline/funnel');

// ─── Parse CLI Arguments ──────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    stage: 'all',
    dryRun: false,
    limit: null,
  };

  for (const arg of args) {
    if (arg.startsWith('--stage=')) {
      options.stage = arg.split('=')[1].toLowerCase().trim();
    } else if (arg === '--dry-run' || arg === '-d') {
      options.dryRun = true;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    }
  }

  if (process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1') {
    options.dryRun = true;
  }
  if (!options.limit) {
    const envTarget = parseInt(process.env.DAILY_TARGET || '', 10);
    options.limit = !isNaN(envTarget) && envTarget > 0 ? envTarget : DAILY_TARGET;
  }

  return options;
}

// ─── Verified Backlog Checker ─────────────────────────────────────────────────
async function getVerifiedBacklogCount() {
  try {
    const snap = await db.collection('candidates').where('status', '==', 'verified').count().get();
    return snap.data().count;
  } catch {
    try {
      const snap = await db.collection('candidates').where('status', '==', 'verified').get();
      return snap.size;
    } catch {
      return 0;
    }
  }
}

// ─── Initial Backlog Counter (Requirement: print per status at start) ──────────
async function printInitialBacklogCounts() {
  const statuses = ['discovered', 'email_found', 'verified', 'needs_review', 'no_email', 'drafted', 'claimed'];
  console.log('🗃️ Current Pipeline Backlog by Status:');
  for (const st of statuses) {
    let count = 0;
    try {
      if (st === 'claimed') {
        let cCount = 0;
        let pCount = 0;
        try {
          const snapC = await db.collection('candidates').where('status', '==', 'claimed').count().get();
          cCount = snapC.data().count;
        } catch {
          const snapC = await db.collection('candidates').where('status', '==', 'claimed').get();
          cCount = snapC.size;
        }
        try {
          const snapP = await db.collection('professors').where('status', '==', 'claimed').count().get();
          pCount = snapP.data().count;
        } catch {
          const snapP = await db.collection('professors').where('status', '==', 'claimed').get();
          pCount = snapP.size;
        }
        count = cCount + pCount;
      } else {
        try {
          const snap = await db.collection('candidates').where('status', '==', st).count().get();
          count = snap.data().count;
        } catch {
          const snap = await db.collection('candidates').where('status', '==', st).get();
          count = snap.size;
        }
      }
    } catch {
      count = 0;
    }
    console.log(`   - [${st}]: ${count}`);
  }
  console.log('----------------------------------------------------------------\n');
}

// ─── Main Pipeline Execution ──────────────────────────────────────────────────
async function main() {
  const options = parseArgs();
  const startTime = Date.now();
  const maxGlobalTimeMs = (parseFloat(process.env.GLOBAL_BUDGET_MIN) || GLOBAL_BUDGET_MIN) * 60 * 1000;
  const dailyTarget = options.limit || DAILY_TARGET;

  // CV Asset Verification: Fail loudly if missing
  const cvPath = path.join(process.cwd(), 'public', 'cv', 'Dr_Shama_Abidi_Academic_CV.pdf');
  if (!fs.existsSync(cvPath)) {
    console.error('\n================================================================');
    console.error('🚨 FATAL ERROR: Required CV file is MISSING!');
    console.error(`   Expected location: ${cvPath}`);
    console.error('   Dr. Shama Abidi Academic CV must be present to run the outreach pipeline.');
    console.error('================================================================\n');
    process.exit(1);
  }

  console.log('================================================================');
  console.log('🌟 PhDReach / Shama CRM – Adaptive Outreach Pipeline');
  console.log(`⏱️  Start Time: ${new Date().toISOString()}`);
  console.log(`⚙️  Target Stage: ${options.stage.toUpperCase()}`);
  console.log(`🛡️  Dry Run Mode: ${options.dryRun ? 'ENABLED (Read-Only: No Firestore writes, No IMAP appends)' : 'DISABLED'}`);
  console.log(`🎯  Daily Target: ${dailyTarget} drafts (Min: ${DAILY_MIN}, Max: ${DAILY_MAX})`);
  console.log(`⏳  Global Budget: ${(maxGlobalTimeMs / 60000).toFixed(0)} minutes`);
  console.log('================================================================');

  // Print current backlog status at the start of every run
  await printInitialBacklogCounts();

  const runData = {
    rounds: 0,
    discovered_new: 0,
    email_attempted: 0,
    email_found: 0,
    email_found_by_source: {},
    source_diagnostics: {
      pubmed: { attempted: 0, found: 0, failed: 0, skipped: 0, http_errors: 0 },
      'pmc-fulltext': { attempted: 0, found: 0, failed: 0, skipped_no_pmcid: 0, http_errors: 0 },
      'core-fulltext': { attempted: 0, found: 0, failed: 0, skipped: 0, http_errors: 0 },
      orcid: { attempted: 0, found: 0, failed: 0, skipped: 0, http_errors: 0, failure_reasons: {} },
      'faculty-page': { attempted: 0, found: 0, failed: 0, skipped: 0, http_errors: 0, failure_reasons: {} },
    },
    author_mismatch_reassigned: 0,
    no_email: 0,
    verify_passed: 0,
    needs_review: 0,
    verify_rejected: 0,
    verify_rejected_by_reason: {},
    orcid_domain_mismatches: 0,
    drafted: 0,
    skipped_dup: 0,
    failed: 0,
    generator_counts: { groq: 0, gemini: 0, template: 0 },
    drafted_samples: [],
  };

  try {
    if (options.stage === 'bounce') {
      await runStage5Bounce(options);
      process.exit(0);
    }

    if (options.stage !== 'all') {
      // Single Stage Execution
      if (options.stage === 'discover') {
        const s1 = await runStage1Discover(options);
        runData.discovered_new = s1.discovered_new;
        runData.skipped_dup = s1.skipped_dup;
      } else if (options.stage === 'email') {
        const s2 = await runStage2Email(options);
        runData.email_attempted = s2.attempted;
        runData.email_found = s2.found;
        runData.email_found_by_source = s2.found_by_source;
        runData.source_diagnostics = s2.source_diagnostics;
        runData.author_mismatch_reassigned = s2.author_mismatch_reassigned;
        runData.no_email = s2.no_email;
      } else if (options.stage === 'verify') {
        const s3 = await runStage3Verify(options);
        runData.verify_passed = s3.passed;
        runData.needs_review = s3.needs_review;
        runData.verify_rejected = s3.rejected;
        runData.verify_rejected_by_reason = s3.rejected_by_reason;
      } else if (options.stage === 'draft') {
        const s4 = await runStage4Draft(options);
        runData.drafted = s4.drafted;
        runData.skipped_dup = s4.skipped_dup;
        runData.failed = s4.failed;
        runData.generator_counts = s4.generator_counts;
        runData.drafted_samples = s4.drafted_samples;
        if (s4.ai_errors) {
          runData.ai_errors = [...(runData.ai_errors || []), ...s4.ai_errors];
        }
      }
    } else {
      // ═════════════════════════════════════════════════════════════════════════
      // Adaptive Multi-Round Pipeline: discover -> email -> verify -> draft
      // ═════════════════════════════════════════════════════════════════════════
      let round = 1;
      let inMemoryCandidates = [];

      while (runData.drafted < dailyTarget && Date.now() - startTime < maxGlobalTimeMs) {
        console.log(`\n================================================================`);
        console.log(`🔄 ROUND ${round}: Executing Outreach Cycle [Drafted So Far: ${runData.drafted}/${dailyTarget}]`);
        console.log(`================================================================`);
        runData.rounds = round;

        // Buffer Rule Check: Reads real Firestore backlog for buffer rule (allowed in dry-run)
        const realDbBacklog = await getVerifiedBacklogCount().catch(() => 0);
        const verifiedBacklog = options.dryRun
          ? realDbBacklog + inMemoryCandidates.filter((c) => c.status === 'verified').length
          : realDbBacklog;

        let discoverLimit = DISCOVER_MAX;
        if (verifiedBacklog < 3 * dailyTarget) {
          const remainingDrafts = Math.max(1, dailyTarget - runData.drafted);
          const emailFoundRate = runData.email_attempted > 0 ? runData.email_found / runData.email_attempted : 0.25;
          const verifyRate = runData.email_found > 0 && runData.verify_passed > 0 ? runData.verify_passed / runData.email_found : 0.60;
          const measuredConversion = Math.max(0.05, emailFoundRate) * Math.max(0.10, verifyRate);
          const neededCandidates = Math.max(60, Math.ceil(remainingDrafts / measuredConversion));

          discoverLimit = neededCandidates;
          console.log(`   💡 [Buffer Rule Activated] Backlog (${verifiedBacklog}) < 3x Target (${3 * dailyTarget}).`);
          console.log(`      Measured Yield: (Email: ${(emailFoundRate * 100).toFixed(0)}%, Verify: ${(verifyRate * 100).toFixed(0)}%). Dynamic Target: ${neededCandidates} candidates.`);
        }

        // ── Round Stage 1: Discover ──
        const s1 = await runStage1Discover({ ...options, limit: discoverLimit });
        runData.discovered_new += s1.discovered_new;
        runData.skipped_dup += s1.skipped_dup;

        const newCandidates = s1.discovered_candidates || [];
        inMemoryCandidates.push(...newCandidates);

        // ── Round Stage 2: Email ──
        const s2Options = {
          ...options,
          limit: Math.max(EMAIL_MAX, discoverLimit),
          candidates: options.dryRun
            ? inMemoryCandidates.filter((c) => c.status === 'discovered' || (c.status === 'no_email' && c.retryAfter && new Date(c.retryAfter) <= new Date()))
            : undefined,
        };
        const s2 = await runStage2Email(s2Options);
        runData.email_attempted += s2.attempted;
        runData.email_found += s2.found;
        runData.author_mismatch_reassigned += s2.author_mismatch_reassigned;
        runData.no_email += s2.no_email;

        for (const [src, cnt] of Object.entries(s2.found_by_source || {})) {
          runData.email_found_by_source[src] = (runData.email_found_by_source[src] || 0) + cnt;
        }
        for (const [src, diag] of Object.entries(s2.source_diagnostics || {})) {
          if (!runData.source_diagnostics[src]) {
            runData.source_diagnostics[src] = { attempted: 0, found: 0, failed: 0, skipped: 0, http_errors: 0, failure_reasons: {} };
          }
          runData.source_diagnostics[src].attempted += diag.attempted || 0;
          runData.source_diagnostics[src].found += diag.found || 0;
          runData.source_diagnostics[src].failed += diag.failed || 0;
          runData.source_diagnostics[src].skipped += (diag.skipped_no_pmcid !== undefined ? diag.skipped_no_pmcid : (diag.skipped || 0));
          runData.source_diagnostics[src].http_errors += diag.http_errors || 0;
          if (diag.failure_reasons) {
            runData.source_diagnostics[src].failure_reasons = runData.source_diagnostics[src].failure_reasons || {};
            for (const [r, c] of Object.entries(diag.failure_reasons)) {
              runData.source_diagnostics[src].failure_reasons[r] = (runData.source_diagnostics[src].failure_reasons[r] || 0) + c;
            }
          }
        }

        if (options.dryRun && s2.processed_candidates) {
          for (const pc of s2.processed_candidates) {
            const idx = inMemoryCandidates.findIndex((c) => c.id === pc.id || c.name === pc.name);
            if (idx !== -1) inMemoryCandidates[idx] = { ...inMemoryCandidates[idx], ...pc };
            else inMemoryCandidates.push(pc);
          }
        }

        // ── Round Stage 3: Verify ──
        const s3Options = {
          ...options,
          limit: Math.max(VERIFY_MAX, discoverLimit),
          candidates: options.dryRun
            ? inMemoryCandidates.filter((c) => c.status === 'email_found' || (c.status === 'needs_review' && c.retryAfter && new Date(c.retryAfter) <= new Date()))
            : undefined,
        };
        const s3 = await runStage3Verify(s3Options);
        runData.verify_passed += s3.passed;
        runData.needs_review += s3.needs_review;
        runData.verify_rejected += s3.rejected;

        for (const [r, cnt] of Object.entries(s3.rejected_by_reason || {})) {
          runData.verify_rejected_by_reason[r] = (runData.verify_rejected_by_reason[r] || 0) + cnt;
        }

        if (options.dryRun && s3.processed_candidates) {
          for (const pc of s3.processed_candidates) {
            const idx = inMemoryCandidates.findIndex((c) => c.id === pc.id || c.name === pc.name);
            if (idx !== -1) inMemoryCandidates[idx] = { ...inMemoryCandidates[idx], ...pc };
          }
        }

        // ── Round Stage 4: Draft ──
        const remainingToDraft = dailyTarget - runData.drafted;
        const s4Options = {
          ...options,
          limit: Math.min(remainingToDraft, DAILY_MAX),
          candidates: options.dryRun ? inMemoryCandidates.filter((c) => c.status === 'verified') : undefined,
        };
        const s4 = await runStage4Draft(s4Options);
        runData.drafted += s4.drafted;
        runData.skipped_dup += s4.skipped_dup;
        runData.failed += s4.failed;

        if (s4.generator_counts) {
          runData.generator_counts.groq += s4.generator_counts.groq || 0;
          runData.generator_counts.gemini += s4.generator_counts.gemini || 0;
          runData.generator_counts.template += s4.generator_counts.template || 0;
        }
        if (s4.drafted_samples) {
          runData.drafted_samples.push(...s4.drafted_samples);
        }
        if (s4.ai_errors) {
          runData.ai_errors = [...(runData.ai_errors || []), ...s4.ai_errors];
        }

        console.log(`\n🏁 [End of Round ${round}] Total Drafted: ${runData.drafted}/${dailyTarget}`);

        if (runData.drafted >= dailyTarget) {
          console.log(`🎉 Daily target of ${dailyTarget} drafts achieved!`);
          break;
        }

        if (Date.now() - startTime >= maxGlobalTimeMs) {
          console.log(`⏱️ Global runtime budget of ${(maxGlobalTimeMs / 60000).toFixed(0)}m reached.`);
          break;
        }

        round++;
      }
    }

    // ── OBSERVABILITY & FUNNEL REPORT ──
    const funnel = await recordAndPrintFunnel(runData, options);

    // ── SHORTFALL HANDLING (Requirement 5) ──
    const effectiveDailyMin = Math.min(DAILY_MIN, options.limit);
    if (runData.drafted < effectiveDailyMin && (options.stage === 'all' || options.stage === 'draft')) {
      const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);
      const emailRate = runData.email_attempted > 0 ? ((runData.email_found / runData.email_attempted) * 100).toFixed(1) : '0.0';

      console.log(`\n================================================================`);
      console.log(`🚨 SHORTFALL ALERT: Drafted ${runData.drafted} < Minimum Daily Target (${effectiveDailyMin})`);
      console.log(`================================================================`);
      console.log(`📊 Stage Breakdown:`);
      console.log(`   - Stage 1 Discovery:  ${runData.discovered_new} candidates found ${runData.discovered_new < 30 ? '(LOW DISCOVERY)' : ''}`);
      console.log(`   - Stage 2 Email:      ${runData.email_found}/${runData.email_attempted} (${emailRate}%) ${parseFloat(emailRate) < 20 ? '(LOW EMAIL YIELD)' : ''}`);
      console.log(`   - Stage 3 Review:     ${runData.needs_review} candidates in needs_review ${runData.needs_review > runData.verify_passed ? '(HIGH REVIEW VOLUME)' : ''}`);
      console.log(`   - Runtime Budget:     ${elapsedMin}m / ${(maxGlobalTimeMs / 60000).toFixed(0)}m ${Date.now() - startTime >= maxGlobalTimeMs ? '(GLOBAL BUDGET EXHAUSTED)' : ''}`);
      console.log(`================================================================\n`);
    }

    const totalDurationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`🏁 Pipeline execution finished in ${totalDurationSec}s.`);

    // Health check: exit non-zero when conditions fail
    if (options.stage === 'all' || options.stage === 'draft') {
      const verifiedBacklog = await getVerifiedBacklogCount().catch(() => 0);
      const isBudgetExhausted = Date.now() - startTime >= maxGlobalTimeMs;

      if (runData.drafted === 0) {
        let reason = 'no candidates';
        if (runData.failed > 0 && runData.failed >= (runData.email_found || 1)) {
          reason = 'all failed';
        } else if (isBudgetExhausted) {
          reason = 'budget exhausted';
        }
        console.error(`❌ Pipeline exited non-zero: 0 candidates drafted (${reason}).`);
        process.exit(1);
      }

      if (runData.drafted < Math.ceil(dailyTarget * 0.5) && verifiedBacklog === 0) {
        console.error(`❌ Pipeline exited non-zero: drafted ${runData.drafted} < 50% of target (${dailyTarget}) and verified backlog is 0.`);
        process.exit(1);
      }
    }

    process.exit(0);
  } catch (fatalErr) {
    console.error('💥 Fatal Pipeline Error:', fatalErr);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
