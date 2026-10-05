const { ImapFlow } = require('imapflow');

async function inspectInbox() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.log('No credentials');
    return;
  }
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      console.log('Mailbox status total messages:', client.mailbox.exists);
      // Fetch latest 5 messages
      if (client.mailbox.exists > 0) {
        const start = Math.max(1, client.mailbox.exists - 5);
        for await (const message of client.fetch(`${start}:*`, { envelope: true })) {
          const from = message.envelope?.from?.[0]?.address;
          const subject = message.envelope?.subject;
          console.log(`Msg from: "${from}" | Subject: "${subject}"`);
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    console.error('IMAP error:', e);
  }
}

inspectInbox();
