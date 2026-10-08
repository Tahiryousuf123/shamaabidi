import { adminDb } from '../lib/firebase-admin';

async function main() {
  const verifiedSnap = await adminDb
    .collection('professors')
    .where('verificationLevel', '==', 'verified')
    .limit(5)
    .get();

  console.log(`FOUND ${verifiedSnap.size} VERIFIED PROFESSORS:`);
  verifiedSnap.docs.forEach((doc, idx) => {
    console.log(`\n=== PROFESSOR #${idx + 1} (${doc.id}) ===`);
    console.log(JSON.stringify(doc.data(), null, 2));
  });
}

main().catch(console.error);
