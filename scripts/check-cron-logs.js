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
  console.log('=== LATEST 10 CRON LOGS ===');
  const cronSnap = await db.collection('cron_logs').orderBy('createdAt', 'desc').limit(10).get();
  if (cronSnap.empty) {
    console.log('No cron_logs found!');
  } else {
    cronSnap.forEach(d => {
      const data = d.data();
      const time = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt;
      console.log(`[${time}] Type: ${data.type} | Message: ${data.message}`);
      if (data.details) console.log('Details:', JSON.stringify(data.details));
    });
  }

  console.log('\n=== LATEST 5 PROFESSORS ADDED ===');
  const profsSnap = await db.collection('professors').orderBy('createdAt', 'desc').limit(5).get();
  profsSnap.forEach(d => {
    const data = d.data();
    const time = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt;
    console.log(`[${time}] Name: ${data.name} | Uni: ${data.university} | Status: ${data.status} | Source: ${data.discoverySource}`);
  });
}

run().catch(console.error);
