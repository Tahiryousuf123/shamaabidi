const { adminDb } = require('../lib/firebase-admin');

async function checkProfs() {
  const snap = await adminDb.collection('professors').get();
  console.log(`Total professors in Firestore: ${snap.size}`);
  snap.docs.forEach((d) => {
    const data = d.data();
    console.log(`ID: ${d.id} | Name: ${data.name} | Status: ${data.status} | Email: ${data.email}`);
  });
}

checkProfs().then(() => process.exit(0));
