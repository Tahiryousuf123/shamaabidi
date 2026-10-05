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

async function testAppendDraft() {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    logger: false,
  });

  await client.connect();
  console.log('Connected to IMAP!');

  const rawEmail = `From: "Dr. Shama Abidi" <${process.env.GMAIL_USER}>
To: test-recipient@example.ac.uk
Subject: [TEST DRAFT] PhD Research Inquiry: Clinical Pharmacy & Practice
Date: ${new Date().toUTCString()}
Message-ID: <test-draft-${Date.now()}@gmail.com>
Content-Type: text/plain; charset=utf-8

Dear Professor,

This is a test draft generated to verify that drafts appear directly in Dr. Shama Abidi's Gmail Drafts folder.

Kind regards,
Dr. Shama Abidi
Clinical Pharmacist | MPhil Pharmacy Practice
`;

  const res = await client.append('[Gmail]/Drafts', Buffer.from(rawEmail, 'utf-8'), ['\\Draft', '\\Seen']);
  console.log('Appended to [Gmail]/Drafts successfully! UID:', res.uid);

  await client.logout();
}

testAppendDraft().then(() => process.exit(0)).catch(e => { console.error('Error:', e); process.exit(1); });
