const { ImapFlow } = require('imapflow');

async function testFetchFrom() {
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
    const lock = await client.getMailboxLock('INBOX');
    try {
      console.log('Testing client.search({ from: ... })...');
      const searchResult = await client.search({ from: 'no-reply@accounts.google.com' });
      console.log('client.search result:', searchResult);

      console.log('Testing client.fetch({ from: ... })...');
      try {
        const messages = client.fetch({ from: 'no-reply@accounts.google.com' }, { envelope: true });
        for await (const msg of messages) {
          console.log('msg found via fetch:', msg.uid);
          break;
        }
      } catch (fetchErr) {
        console.log('client.fetch error:', fetchErr.message);
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error('Test error:', err);
  }
}

testFetchFrom();
