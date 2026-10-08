const { ImapFlow } = require('imapflow');
const { db, FieldValue } = require('./db');
const { sha1, extractDomain } = require('./config');

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

async function runStage5Bounce(options = {}) {
  const isDryRun = Boolean(options.dryRun);

  console.log(`\n================================================================`);
  console.log(`📬 STAGE 5: BOUNCE & REPLY HOUSEKEEPING`);
  console.log(`   Dry Run: ${isDryRun}`);
  console.log(`================================================================`);

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.log('   ℹ️ Gmail credentials not configured. Skipping bounce check.');
    return { scanned: 0, bounced_marked: 0 };
  }

  let client;
  let scannedCount = 0;
  let bouncedMarked = 0;

  try {
    client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Search recent bounce notifications
      const messages = await client.search({
        or: [
          { from: 'mailer-daemon' },
          { from: 'postmaster' },
          { subject: 'Delivery Status Notification' },
          { subject: 'Undeliverable' },
        ],
      });

      const messageUids = Array.isArray(messages) ? messages.slice(-50) : [];
      console.log(`   Scanned INBOX: found ${messageUids.length} potential bounce reports.`);

      for (const uid of messageUids) {
        scannedCount++;
        const msg = await client.fetchOne(uid, { envelope: true, source: true });
        if (!msg || !msg.source) continue;

        const bodyText = msg.source.toString('utf8');
        const emails = bodyText.match(EMAIL_REGEX) || [];

        for (const em of emails) {
          const cleanEmail = em.toLowerCase().trim();
          if (cleanEmail === user.toLowerCase()) continue;
          if (cleanEmail.includes('google.com') || cleanEmail.includes('gmail.com') && cleanEmail.includes('mailer')) continue;

          // Check if candidate exists in candidates collection
          const candDocId = sha1(cleanEmail);
          const candSnap = await db.collection('candidates').doc(candDocId).get();

          if (candSnap.exists) {
            bouncedMarked++;
            console.log(`      ⚠️ Detected bounced email: <${cleanEmail}>`);

            if (!isDryRun) {
              await candSnap.ref.update({
                status: 'bounced',
                lastError: 'Permanent bounce detected in Gmail INBOX',
                updatedAt: FieldValue.serverTimestamp(),
              });

              // Also update professors collection
              const profSnap = await db.collection('professors').doc(candDocId).get();
              if (profSnap.exists) {
                await profSnap.ref.update({
                  status: 'bounced',
                  bounceReason: 'Mailer-daemon bounce notification',
                  updatedAt: FieldValue.serverTimestamp(),
                });
              }

              // Store bouncedDomains counters so repeated bounces from one domain lower that domain's priority
              const dom = extractDomain(cleanEmail);
              if (dom) {
                await db.collection('state').doc('bouncedDomains').set(
                  { [dom.replace(/\./g, '_')]: FieldValue.increment(1) },
                  { merge: true }
                ).catch(() => {});
              }
            }
          }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.warn('   ⚠️ Bounce check encountered error:', err.message);
  }

  console.log(`\n📋 STAGE 5 SUMMARY:`);
  console.log(`   - Scanned Messages: ${scannedCount}`);
  console.log(`   - Bounced Candidates Marked: ${bouncedMarked}`);

  return {
    scanned: scannedCount,
    bounced_marked: bouncedMarked,
  };
}

module.exports = {
  runStage5Bounce,
};
