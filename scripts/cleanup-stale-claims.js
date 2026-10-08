#!/usr/bin/env node
/**
 * Cleanup Stale Claims & Dry-Run Artifacts
 *
 * Finds:
 * 1. Docs stuck in status 'claimed' older than 1 hour in `professors`.
 * 2. Docs in `professors` created in the last 24h that have no real Gmail draft (e.g. gmailSynced == false or created by dry-run).
 * 3. Matching entries in `seen_professors`.
 * 4. Candidates in `candidates` marked 'drafted'/'verified' that have no real Gmail draft.
 * 5. Run summaries in `runs` created with dryRun: true.
 *
 * Usage:
 *   node scripts/cleanup-stale-claims.js            # Default DRY RUN (only inspects & prints)
 *   node scripts/cleanup-stale-claims.js --execute  # Actually executes cleanup and releases docs
 */

const { db, FieldValue } = require('./pipeline/db');
const { isEmailDomainMatchingInstitution } = require('./pipeline/stage3-verify');

async function main() {
  const isExecute = process.argv.includes('--execute') || process.argv.includes('--force');
  const isDryRun = !isExecute;

  console.log('================================================================');
  console.log('🧹 PhDReach / Shama CRM – Stale Claims & Test Artifact Cleanup');
  console.log(`⏱️  Timestamp: ${new Date().toISOString()}`);
  console.log(`🛡️  Mode: ${isDryRun ? 'DRY-RUN (Safe inspection only, no mutations)' : 'EXECUTE (Mutations enabled)'}`);
  console.log('================================================================\n');

  const now = Date.now();
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const cutoff24h = new Date(now - TWENTY_FOUR_HOURS_MS);

  const staleProfessors = [];
  const staleSeen = [];
  const staleCandidates = [];
  const staleRuns = [];

  // ─── 1. Scan `professors` Collection ───────────────────────────────────────
  console.log('🔍 Scanning `professors` collection...');
  const profsSnap = await db.collection('professors').get();
  
  for (const doc of profsSnap.docs) {
    const data = doc.data();
    const createdDate = data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : null);
    const draftedDate = data.draftedAt?.toDate ? data.draftedAt.toDate() : (data.draftedAt ? new Date(data.draftedAt) : null);
    const effectiveDate = draftedDate || createdDate;

    // A. Stuck in status 'claimed' older than 1 hour
    if (data.status === 'claimed') {
      const ageMs = createdDate ? (now - createdDate.getTime()) : ONE_HOUR_MS + 1;
      if (ageMs > ONE_HOUR_MS) {
        staleProfessors.push({
          id: doc.id,
          ref: doc.ref,
          name: data.name,
          email: data.email,
          status: data.status,
          createdAt: createdDate?.toISOString() || 'Unknown',
          reason: `Stuck in status 'claimed' for > 1 hour (${Math.round(ageMs / 60000)}m ago)`,
        });
        continue;
      }
    }

    // B. Created/drafted in last 24h with no real Gmail draft (gmailSynced !== true)
    if (effectiveDate && effectiveDate >= cutoff24h && (data.status === 'drafted' || data.status === 'claimed')) {
      if (data.gmailSynced !== true) {
        staleProfessors.push({
          id: doc.id,
          ref: doc.ref,
          name: data.name,
          email: data.email,
          status: data.status,
          createdAt: createdDate?.toISOString() || draftedDate?.toISOString() || 'Unknown',
          reason: 'Created in last 24h by test/dry-run with no real Gmail draft (gmailSynced == false)',
        });
      }
    }
  }

  console.log(`   Found ${staleProfessors.length} target docs in \`professors\`.`);

  // ─── 2. Scan `seen_professors` Collection ──────────────────────────────────
  console.log('🔍 Scanning `seen_professors` collection...');
  const seenSnap = await db.collection('seen_professors').get();

  for (const doc of seenSnap.docs) {
    const data = doc.data();
    const createdDate = data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : null);
    const draftedDate = data.draftedAt?.toDate ? data.draftedAt.toDate() : (data.draftedAt ? new Date(data.draftedAt) : null);
    const effectiveDate = draftedDate || createdDate;

    // Check if matches any stale professor email or name
    const matchesStaleProf = staleProfessors.some(
      (p) => (p.email && p.email === data.email) || (p.name && p.name === data.name)
    );

    if (matchesStaleProf || (effectiveDate && effectiveDate >= cutoff24h && data.status === 'drafted')) {
      staleSeen.push({
        id: doc.id,
        ref: doc.ref,
        name: data.name || 'Unknown',
        email: data.email || 'Unknown',
        status: data.status,
        createdAt: createdDate?.toISOString() || draftedDate?.toISOString() || 'Unknown',
        reason: 'Matching test/dry-run claim in seen_professors',
      });
    }
  }

  console.log(`   Found ${staleSeen.length} target docs in \`seen_professors\`.`);

  // ─── 3. Scan `candidates` Collection ───────────────────────────────────────
  console.log('🔍 Scanning `candidates` collection...');
  const candSnap = await db.collection('candidates').get();

  for (const doc of candSnap.docs) {
    const data = doc.data();
    if (data.status === 'drafted' || data.status === 'verified') {
      const createdDate = data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : null);
      const updatedDate = data.updatedAt?.toDate ? data.updatedAt.toDate() : (data.updatedAt ? new Date(data.updatedAt) : null);
      
      // If candidate was marked drafted in last 24h without real Gmail draft
      const matchesStaleProf = staleProfessors.some(
        (p) => (p.email && p.email === data.email) || (p.name && p.name === data.name)
      );

      if (matchesStaleProf || data.status === 'drafted') {
        const targetStatus = data.email ? 'verified' : 'discovered';
        let emailConfidence = data.emailConfidence || null;

        // If ORCID email domain does not match institution, preserve or set 'orcid-domain-mismatch'
        if (data.email && data.emailSource === 'orcid') {
          const isMatch = isEmailDomainMatchingInstitution(data.email, data.institution, data.institutionHomepage);
          if (!isMatch) {
            emailConfidence = 'orcid-domain-mismatch';
          }
        }

        staleCandidates.push({
          id: doc.id,
          ref: doc.ref,
          name: data.name,
          email: data.email,
          emailConfidence,
          status: data.status,
          targetStatus,
          createdAt: createdDate?.toISOString() || updatedDate?.toISOString() || 'Unknown',
          reason: 'Candidate marked drafted/verified during dry-run with no real Gmail draft',
          action: data.email ? `Revert to verified (has email, confidence: ${emailConfidence || 'standard'})` : 'Revert to discovered',
        });
      }
    }
  }

  console.log(`   Found ${staleCandidates.length} target docs in \`candidates\`.`);

  // ─── 4. Scan `runs` Collection ─────────────────────────────────────────────
  console.log('🔍 Scanning `runs` collection...');
  const runsSnap = await db.collection('runs').get();

  for (const doc of runsSnap.docs) {
    const data = doc.data();
    if (data.dryRun === true) {
      staleRuns.push({
        id: doc.id,
        ref: doc.ref,
        createdAt: data.timestamp || 'Unknown',
        stage: data.stage,
        reason: 'Dry-run audit record erroneously saved to runs collection',
      });
    }
  }

  console.log(`   Found ${staleRuns.length} target docs in \`runs\`.\n`);

  // ─── Print Summary Table ───────────────────────────────────────────────────
  console.log('================================================================');
  console.log('📋 CLEANUP CANDIDATE LIST (TO BE RELEASED / DELETED):');
  console.log('================================================================');

  if (staleProfessors.length > 0) {
    console.log('\n--- Collection: `professors` ---');
    console.table(
      staleProfessors.map((p) => ({
        Collection: 'professors',
        DocID: p.id.slice(0, 16) + '...',
        Name: p.name,
        Email: p.email,
        Status: p.status,
        CreatedAt: p.createdAt,
        Reason: p.reason.slice(0, 45) + '...',
      }))
    );
  }

  if (staleSeen.length > 0) {
    console.log('\n--- Collection: `seen_professors` ---');
    console.table(
      staleSeen.map((s) => ({
        Collection: 'seen_professors',
        DocID: s.id.slice(0, 20) + '...',
        Name: s.name,
        Email: s.email,
        Status: s.status,
        CreatedAt: s.createdAt,
        Reason: s.reason,
      }))
    );
  }

  if (staleCandidates.length > 0) {
    console.log('\n--- Collection: `candidates` (Reverting to "verified" if email exists, else "discovered") ---');
    console.table(
      staleCandidates.map((c) => ({
        Collection: 'candidates',
        DocID: c.id.slice(0, 16) + '...',
        Name: c.name,
        Email: c.email || 'N/A',
        Confidence: c.emailConfidence || 'standard',
        CurrentStatus: c.status,
        TargetStatus: c.targetStatus,
        Action: c.action,
        CreatedAt: c.createdAt,
      }))
    );
  }

  if (staleRuns.length > 0) {
    console.log('\n--- Collection: `runs` ---');
    console.table(
      staleRuns.map((r) => ({
        Collection: 'runs',
        DocID: r.id,
        CreatedAt: r.createdAt,
        Stage: r.stage,
        Reason: r.reason,
      }))
    );
  }

  const totalStale = staleProfessors.length + staleSeen.length + staleCandidates.length + staleRuns.length;
  console.log(`\nTotal items flagged: ${totalStale}`);

  // ─── Execute Deletions / Releases if requested ─────────────────────────────
  if (isDryRun) {
    console.log('\n🛡️ [DRY RUN ACTIVE] No changes made to Firestore.');
    console.log('👉 To delete stale claims and revert candidates, run:');
    console.log('   node scripts/cleanup-stale-claims.js --execute\n');
  } else {
    console.log('\n🚀 [EXECUTING CLEANUP] Mutating Firestore collections...');

    for (const p of staleProfessors) {
      await p.ref.delete();
      console.log(`   🗑️ Deleted professors/${p.id} (${p.name})`);
    }

    for (const s of staleSeen) {
      await s.ref.delete();
      console.log(`   🗑️ Deleted seen_professors/${s.id}`);
    }

    for (const c of staleCandidates) {
      if (c.targetStatus === 'verified') {
        await c.ref.update({
          status: 'verified',
          emailConfidence: c.emailConfidence || 'standard',
          updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`   🔄 Reverted candidate/${c.id} (${c.name}) to 'verified' (retained verified email: ${c.email}, confidence: ${c.emailConfidence})`);
      } else {
        await c.ref.update({
          status: 'discovered',
          email: null,
          emailSource: null,
          emailConfidence: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`   🔄 Reverted candidate/${c.id} (${c.name}) to 'discovered'`);
      }
    }

    for (const r of staleRuns) {
      await r.ref.delete();
      console.log(`   🗑️ Deleted runs/${r.id}`);
    }

    console.log('\n✅ Stale claims and dry-run artifacts successfully cleaned up!\n');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal cleanup error:', err);
    process.exit(1);
  });
}

module.exports = { main };
