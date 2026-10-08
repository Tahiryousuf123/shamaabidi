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

function computeScore(p) {
  const text = `${p.matchReason || ''} ${p.researchArea || ''} ${p.recentPaper || ''} ${p.evidenceSnippet || ''}`.toLowerCase();
  let score = 75;

  if (text.includes('antimicrobial') || text.includes('stewardship') || text.includes('carbapenem') || text.includes('resistance') || text.includes('amr')) {
    score = Math.max(score, 96);
  }
  if (text.includes('high-alert') || text.includes('medication safety') || text.includes('adverse drug') || text.includes('naranjo')) {
    score = Math.max(score, 94);
  }
  if (text.includes('artificial intelligence') || text.includes('clinical decision support') || text.includes('ai meets') || text.includes('machine learning')) {
    score = Math.max(score, 93);
  }
  if (text.includes('calcium channel') || text.includes('beta blocker') || text.includes('angina') || text.includes('cardiovascular')) {
    score = Math.max(score, 91);
  }
  if (text.includes('evidence-based') || text.includes('evidence based') || text.includes('implementation') || text.includes('pharmacy practice')) {
    score = Math.max(score, 89);
  }
  if (text.includes('clinical pharmacy') || text.includes('hospital pharmacy') || text.includes('icu') || text.includes('patient safety')) {
    score = Math.max(score, 87);
  }

  return score;
}

async function migrate() {
  console.log('Starting migration...');

  // 1. Update Profile to 50 daily targets
  await db.collection('profile').doc('main').set({
    dailyFindTarget: 50,
    dailySendLimit: 50,
  }, { merge: true });
  console.log('✅ Updated profile/main to dailyFindTarget: 50, dailySendLimit: 50');

  // 2. Update Professors with Match Scores
  const snap = await db.collection('professors').get();
  console.log(`Processing ${snap.size} professors...`);

  let updated = 0;
  const batchSize = 400;
  let batch = db.batch();
  let countInBatch = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (typeof data.relevanceScore !== 'number' || data.relevanceScore <= 0) {
      const score = computeScore(data);
      batch.update(doc.ref, { relevanceScore: score });
      updated++;
      countInBatch++;

      if (countInBatch >= batchSize) {
        await batch.commit();
        batch = db.batch();
        countInBatch = 0;
      }
    }
  }

  if (countInBatch > 0) {
    await batch.commit();
  }

  console.log(`✅ Backfilled relevanceScore on ${updated} professors!`);
}

migrate().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
