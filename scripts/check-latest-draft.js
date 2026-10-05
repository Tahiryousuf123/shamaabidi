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
  const snap = await db.collection('emails').orderBy('createdAt', 'desc').limit(2).get();
  snap.forEach(d => {
    const data = d.data();
    console.log('=== EMAIL DRAFT ===');
    console.log('ID:', d.id);
    console.log('ProfessorId:', data.professorId);
    console.log('Subject:', data.subject);
    console.log('Body:\n' + data.body);
    console.log('====================\n');
  });
}

run().catch(console.error);
