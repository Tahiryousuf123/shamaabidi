const { ImapFlow } = require('imapflow');

async function testMailboxOpen() {
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

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');
    console.log('mailboxOpen success!');
    const messages = client.fetch({ from: 'no-reply@accounts.google.com' }, { envelope: true });
    for await (const msg of messages) {
      console.log('msg found:', msg.uid);
      break;
    }
    await client.mailboxClose();
    await client.logout();
    console.log('Done!');
  } catch (err) {
    console.error('mailboxOpen error:', err);
  }
}

testMailboxOpen();
