try {
  process.loadEnvFile('.env.local');
} catch {}

import { adminDb } from '../lib/firebase-admin';

async function listSaved() {
  const snap = await adminDb
    .collection('professors')
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();

  console.log(`Found ${snap.size} latest professors in Firestore:\n`);
  snap.docs.forEach((doc, idx) => {
    const d = doc.data();
    console.log(`=== PROFESSOR #${idx + 1} (Doc ID: ${doc.id}) ===`);
    console.log(`Name:                   ${d.name}`);
    console.log(`University:             ${d.university}`);
    console.log(`Country:                ${d.country}`);
    console.log(`Email:                  ${d.email}`);
    console.log(`Email Source URL:       ${d.emailSourceUrl}`);
    console.log(`Profile Source URL:     ${d.profileSourceUrl}`);
    console.log(`Evidence Snippet:       ${d.evidenceSnippet}`);
    console.log(`Match Reason:           ${d.matchReason}`);
    console.log(`Funding Available:      ${d.fundingAvailable}`);
    console.log(`Funding Source:         ${d.fundingSource}`);
    console.log(`Funding Classification: ${d.fundingClassification}`);
    console.log(`Relevance Score:        ${d.relevanceScore}%`);
    console.log(`Verification Level:     ${d.verificationLevel}`);
    console.log(`OpenAlex Author ID:     ${d.openAlexAuthorId}`);
    console.log(`ORCID:                  ${d.orcid}`);
    console.log(`Recent Paper:           ${d.recentPaper}`);
    console.log(`Status:                 ${d.status}`);
    console.log(`Discovery Source:       ${d.discoverySource}`);
    console.log(`Discovery Confidence:   ${d.discoveryConfidence || 'N/A'}`);
    console.log(`Sources:                ${JSON.stringify(d.sources || [])}`);
    console.log(`Source Count:           ${d.sourceCount || 1}`);
    console.log(`Source Verified Date:   ${d.sourceVerifiedDate}\n`);
  });
}

listSaved().catch(console.error);
