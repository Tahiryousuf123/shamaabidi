try {
  process.loadEnvFile('.env.local');
} catch {}

import { adminDb } from '../lib/firebase-admin';

async function checkRunDoc() {
  const doc = await adminDb.collection('runs').doc('run_2026-10-07').get();
  if (!doc.exists) {
    console.log('run_2026-10-07 does not exist yet');
    return;
  }
  const d = doc.data();
  console.log('Daily Run Doc: run_2026-10-07');
  console.log('Date:', d?.date);
  console.log('Topic:', d?.topic);
  console.log('Total Raw:', d?.totalRawCandidates);
  console.log('Total Relevance:', d?.totalPassedRelevance);
  console.log('Total Verified:', d?.totalPassedVerification);
  console.log('Total Saved:', d?.totalSaved);
  console.log('Per Source Stats:');
  console.table(d?.perSourceStats);
}

checkRunDoc().catch(console.error);
