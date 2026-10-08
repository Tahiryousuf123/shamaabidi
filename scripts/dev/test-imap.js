const fs = require('fs');
const path = require('path');
const { ImapFlow } = require('imapflow');

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
    process.env[key] = val;
  }
}

async function testImap() {
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

  console.log('Connecting to IMAP with', process.env.GMAIL_USER);
  await client.connect();
  console.log('Connected! Opening INBOX...');
  const lock = await client.getMailboxLock('INBOX');

  try {
    // Fetch recent 10 messages
    const messages = client.fetch({ seq: '1:*' }, { envelope: true });
    let count = 0;
    for await (const msg of messages) {
      count++;
      const env = msg.envelope;
      console.log(`Msg #${msg.seq}:`);
      console.log('  Date:', env.date);
      console.log('  Subject:', env.subject);
      console.log('  From:', JSON.stringify(env.from));
      console.log('  To:', JSON.stringify(env.to));
      console.log('  In-Reply-To:', env.inReplyTo);
    }
    console.log(`Total messages in INBOX: ${count}`);
  } finally {
    lock.release();
    await client.logout();
  }
}

testImap().catch(console.error);
