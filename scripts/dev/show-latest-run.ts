import { adminDb } from '../lib/firebase-admin';

async function main() {
  const runsSnap = await adminDb.collection('runs').orderBy('timestamp', 'desc').limit(1).get();
  if (runsSnap.empty) {
    console.log('No runs found');
    return;
  }
  const runData = runsSnap.docs[0].data();
  console.log('RUN ID:', runsSnap.docs[0].id);
  console.log('PER SOURCE STATS:');
  console.table(runData.perSourceStats);

  // Now let's fetch recently added professors
  const profsSnap = await adminDb.collection('professors').orderBy('createdAt', 'desc').limit(10).get();
  console.log('\n--- RECENTLY ADDED PROFESSORS ---');
  profsSnap.docs.forEach((doc) => {
    const d = doc.data();
    console.log(JSON.stringify({
      id: doc.id,
      name: d.name,
      university: d.university,
      country: d.country,
      email: d.email,
      verificationLevel: d.verificationLevel,
      fundingAvailable: d.fundingAvailable,
      sources: d.sources,
      sourceCount: d.sourceCount,
      discoveryConfidence: d.discoveryConfidence,
      recentPaper: d.recentPaper,
      profileSourceUrl: d.profileSourceUrl,
      emailSourceUrl: d.emailSourceUrl,
      matchReason: d.matchReason,
    }, null, 2));
  });
}

main().catch(console.error);
