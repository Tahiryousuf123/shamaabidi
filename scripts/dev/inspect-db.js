const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

let key = (process.env.FIREBASE_PRIVATE_KEY || '').trim().replace(/\\n/g, '\n');
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: (process.env.FIREBASE_PROJECT_ID || 'shamaabidi-3ddf8').trim(),
    clientEmail: (process.env.FIREBASE_CLIENT_EMAIL || '').trim(),
    privateKey: key,
  })
});

const db = admin.firestore();

async function run() {
  const snap = await db.collection('professors').get();
  console.log('Total professors in Firestore:', snap.size);
  let withEmail = 0;
  const statuses = {};
  const sample = [];
  snap.forEach(d => {
    const data = d.data();
    statuses[data.status] = (statuses[data.status] || 0) + 1;
    if (data.email && data.email.includes('@')) {
      withEmail++;
      if (sample.length < 5) {
        sample.push({
          id: d.id,
          name: data.name,
          uni: data.university,
          email: data.email,
          status: data.status,
          hasFundingAd: data.hasFundingAd,
          paper: data.recentPaper
        });
      }
    }
  });
  console.log('Professors with email:', withEmail);
  console.log('Statuses count:', statuses);
  console.log('Sample professors with email:', JSON.stringify(sample, null, 2));

  const emailsSnap = await db.collection('emails').get();
  console.log('Total email docs in Firestore:', emailsSnap.size);
  const emailStatuses = {};
  emailsSnap.forEach(d => {
    const data = d.data();
    emailStatuses[data.status] = (emailStatuses[data.status] || 0) + 1;
  });
  console.log('Email statuses:', emailStatuses);
}

run().catch(console.error);
