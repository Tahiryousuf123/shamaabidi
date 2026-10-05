/**
 * Automated 50 PhD Professor Daily Discovery Runner
 * Run manually or via Task Scheduler / Cron at 12:00 AM:
 * node scripts/run-daily-50.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const CRON_SECRET = process.env.CRON_SECRET || '9f3c69878bc29a6b797c3ea7abd501ee68371fde814a0bb28488aeceacb20034';
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${PORT}`;

async function runDailyBatch(batchNum) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/cron/find?batch=${batchNum}`, BASE_URL);
    const client = url.protocol === 'https:' ? https : http;

    const req = client.request(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
          'x-cron-secret': CRON_SECRET,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            resolve({ raw: data, statusCode: res.statusCode });
          }
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('======================================================');
  console.log('🚀 Running 12:00 AM Automated Daily 50 PhD Professor Finder');
  console.log(`Target: 50 professors | Destination: ${BASE_URL}`);
  console.log('======================================================\n');

  let totalFound = 0;
  let batch = 1;
  const maxBatches = 15;

  while (batch <= maxBatches) {
    console.log(`[Batch ${batch}] Requesting funded PhD search...`);
    try {
      const res = await runDailyBatch(batch);
      if (res.error) {
        console.error(`❌ Batch ${batch} failed:`, res.error);
        if (res.quotaError) break;
      } else {
        totalFound = res.todayFound ?? totalFound;
        console.log(
          `✅ Batch ${batch} done. Added this run: ${res.addedVerified + res.addedNeedsReview} | Total today: ${totalFound}/${res.dailyTarget || 50}`
        );

        if (totalFound >= (res.dailyTarget || 50)) {
          console.log('\n🎉 Daily target of 50 professors successfully achieved!');
          break;
        }
      }
    } catch (err) {
      console.error(`Batch ${batch} error:`, err.message);
    }

    batch++;
    // Brief 2s delay between batches
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\nRun finished. Today's cumulative found count: ${totalFound}/50`);
}

main().catch(console.error);
