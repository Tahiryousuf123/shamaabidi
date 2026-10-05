import { adminDb } from '../lib/firebase-admin';

async function checkProfs() {
  const snap = await adminDb.collection('professors').get();
  console.log(`Total professors in Firestore: ${snap.size}`);
  snap.docs.forEach((d) => {
    const data = d.data();
    console.log(`ID: ${d.id} | Name: ${data.name} | Status: ${data.status} | Email: ${data.email} | Funding: ${data.fundingAvailable} | hasFundingAd: ${data.hasFundingAd}`);
  });
}

checkProfs().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
