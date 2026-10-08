#!/usr/bin/env node
/**
 * Review List CLI Tool for PhDReach / Shama CRM
 *
 * Displays all candidates currently queued in status 'needs_review' with
 * reviewReason, email, institution, paper title, and evidence.
 *
 * Usage:
 *   node scripts/review-list.js
 *   node scripts/review-list.js --approve=<candidate-id>
 */

const { db, FieldValue } = require('./pipeline/db');

async function main() {
  const args = process.argv.slice(2);
  let approveId = null;
  let rejectId = null;

  for (const arg of args) {
    if (arg.startsWith('--approve=')) {
      approveId = arg.split('=')[1].trim();
    } else if (arg.startsWith('--reject=')) {
      rejectId = arg.split('=')[1].trim();
    }
  }

  if (approveId) {
    try {
      const docRef = db.collection('candidates').doc(approveId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        console.error(`❌ Candidate with ID "${approveId}" not found in Firestore.`);
        process.exit(1);
      }
      const data = docSnap.data();
      await docRef.update({
        status: 'verified',
        manualApproved: true,
        retryAfter: FieldValue.delete(),
        approvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`✅ Candidate "${data.name}" (${approveId}) approved! Status moved to 'verified' and retryAfter cleared.`);
      process.exit(0);
    } catch (err) {
      console.error(`❌ Failed to approve candidate ${approveId}:`, err.message);
      process.exit(1);
    }
  }

  if (rejectId) {
    try {
      const docRef = db.collection('candidates').doc(rejectId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        console.error(`❌ Candidate with ID "${rejectId}" not found in Firestore.`);
        process.exit(1);
      }
      const data = docSnap.data();
      await docRef.update({
        status: 'rejected',
        manualRejected: true,
        retryAfter: FieldValue.delete(),
        rejectedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`🚫 Candidate "${data.name}" (${rejectId}) rejected! Status moved to 'rejected' and retryAfter cleared.`);
      process.exit(0);
    } catch (err) {
      console.error(`❌ Failed to reject candidate ${rejectId}:`, err.message);
      process.exit(1);
    }
  }

  console.log('================================================================');
  console.log('📋 PhDReach / Shama CRM – Candidates Awaiting Manual Review');
  console.log(`⏱️  Timestamp: ${new Date().toISOString()}`);
  console.log('================================================================\n');

  try {
    const snap = await db
      .collection('candidates')
      .where('status', '==', 'needs_review')
      .get();

    if (snap.empty) {
      console.log('✨ No candidates currently in status "needs_review". Backlog is clean.');
      process.exit(0);
    }

    const rows = [];
    snap.forEach((doc) => {
      const d = doc.data();
      const ev = d.emailEvidence || {};
      const evidenceStr = ev.source ? `${ev.source} (${ev.location || ev.pmcid || 'n/a'})` : (d.emailSource || 'n/a');
      rows.push({
        id: doc.id,
        name: d.name,
        email: d.email || 'N/A',
        institution: (d.institution || 'N/A').slice(0, 30),
        reviewReason: d.reviewReason || 'needs_review',
        paperTitle: (d.paperTitle || d.recentWorkTitles?.[0] || 'N/A').slice(0, 45) + '...',
        evidence: evidenceStr,
      });
    });

    console.table(rows);
    console.log(`\nFound ${rows.length} candidate(s) awaiting review.`);
    console.log(`To approve a candidate for drafting: node scripts/review-list.js --approve=<id>\n`);
  } catch (err) {
    console.error('❌ Failed to fetch needs_review candidates:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
