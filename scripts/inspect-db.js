const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
envFile.split(/\r?\n/).forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0 && !line.startsWith('#')) {
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    v = v.replace(/\\n/g, '\n');
    process.env[k] = v;
  }
});

const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY,
    })
  });
}

const db = admin.firestore();

async function inspect() {
  const snap = await db.collection('professors').get();
  console.log(`Total professors in Firestore: ${snap.size}`);
  const statusCounts = {};
  snap.docs.forEach((doc, idx) => {
    const d = doc.data();
    statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
    if (idx < 10) {
      console.log(`[${idx + 1}] ${d.name} (${d.university}) | Score: ${d.relevanceScore}% | Deadline: ${d.deadline} | Status: ${d.status} | Email: ${d.email}`);
    }
  });
  console.log('Status counts:', JSON.stringify(statusCounts, null, 2));

  const emailSnap = await db.collection('emails').get();
  console.log(`Total email drafts/records in Firestore: ${emailSnap.size}`);

  const profileSnap = await db.collection('profile').doc('main').get();
  console.log('Profile daily target:', profileSnap.data()?.dailyFindTarget, 'daily send limit:', profileSnap.data()?.dailySendLimit);
}

inspect().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
