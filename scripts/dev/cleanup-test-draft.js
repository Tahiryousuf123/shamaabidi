const fs = require('fs');
const path = require('path');
const { ImapFlow } = require('imapflow');

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

async function cleanup() {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock('[Gmail]/Drafts');
  try {
    const search = await client.search({ header: ['subject', '[TEST DRAFT]'] });
    if (search && search.length > 0) {
      await client.messageDelete(search);
      console.log('Cleaned up test draft(s):', search);
    } else {
      console.log('No test drafts found to delete.');
    }
  } finally {
    lock.release();
  }
  await client.logout();
}

cleanup().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
