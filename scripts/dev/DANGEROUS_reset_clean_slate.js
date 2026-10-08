/**
 * ⚠️ DANGEROUS CLEAN SLATE RESET SCRIPT ⚠️
 *
 * SAFETY GUARDS:
 * 1. Refuses to run in CI / GitHub Actions environments.
 * 2. Requires explicit confirmation argument: --confirm="DELETE_PIPELINE_DATA"
 * 3. Never touches CRM dashboard collections (`professors`, `emails`, `profile`) unless
 *    --include-crm-data is explicitly specified.
 * 4. Automatically exports a full JSON backup of every document before deletion.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { db } = require('../pipeline/db');

// Guard 1: Refuse in CI
if (process.env.CI || process.env.GITHUB_ACTIONS) {
  console.error('❌ FATAL: This dangerous script refuses to execute in CI/GitHub Actions!');
  process.exit(1);
}

const args = process.argv.slice(2);
const includeCrm = args.includes('--include-crm-data');
const confirmArg = args.find((a) => a.startsWith('--confirm='));

const REQUIRED_CONFIRMATION = 'DELETE_PIPELINE_DATA';

// Collections touched by default (Pipeline queue & scratch data only)
const DEFAULT_COLLECTIONS = ['candidates', 'seen_professors', 'runs', 'cron_logs'];
// CRM Collections (ONLY touched if --include-crm-data is passed)
const CRM_COLLECTIONS = ['professors', 'emails'];

async function backupCollection(colName, backupDir) {
  console.log(`📦 Exporting JSON backup of collection "${colName}"...`);
  const snap = await db.collection(colName).get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const backupFile = path.join(backupDir, `${colName}_backup_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(docs, null, 2), 'utf8');
  console.log(`   ✅ Saved ${docs.length} docs to ${backupFile}`);
  return docs.length;
}

async function deleteCollection(colName) {
  console.log(`🗑️ Deleting documents from collection "${colName}"...`);
  const snap = await db.collection(colName).get();
  let deleted = 0;
  const batchSize = 400;
  let batch = db.batch();
  let countInBatch = 0;

  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    countInBatch++;
    deleted++;
    if (countInBatch >= batchSize) {
      await batch.commit();
      batch = db.batch();
      countInBatch = 0;
    }
  }
  if (countInBatch > 0) {
    await batch.commit();
  }
  console.log(`   ✅ Deleted ${deleted} documents from "${colName}".`);
}

async function run() {
  const collectionsToReset = [...DEFAULT_COLLECTIONS];
  if (includeCrm) {
    collectionsToReset.push(...CRM_COLLECTIONS);
    console.warn('⚠️ WARNING: --include-crm-data is set! CRM professors and emails will be cleared!');
  } else {
    console.log('🛡️ SAFEGUARD ACTIVE: CRM collections (`professors`, `emails`, `profile`) will NOT be touched.');
  }

  // Guard 2: Require confirmation phrase
  const confirmed = confirmArg && confirmArg.split('=')[1] === REQUIRED_CONFIRMATION;
  if (!confirmed) {
    console.error(`\n❌ CONFIRMATION REQUIRED:`);
    console.error(`   You must run this command with: --confirm="${REQUIRED_CONFIRMATION}"`);
    console.error(`   Example: node scripts/dev/DANGEROUS_reset_clean_slate.js --confirm="${REQUIRED_CONFIRMATION}"`);
    process.exit(1);
  }

  // Create backup directory
  const backupDir = path.resolve(__dirname, '../../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log('\n================================================================');
  console.log('⚠️ EXECUTING CLEAN-SLATE RESET');
  console.log('================================================================');

  // Step 1: Backup all collections first
  for (const col of collectionsToReset) {
    await backupCollection(col, backupDir);
  }

  // Step 2: Delete docs
  for (const col of collectionsToReset) {
    await deleteCollection(col);
  }

  console.log('\n✨ Reset completed safely with complete JSON backups stored in ./backups/');
}

run().catch((err) => {
  console.error('Fatal error during reset:', err);
  process.exit(1);
});
