const fs = require('fs');
const path = require('path');
const { ImapFlow } = require('imapflow');
const admin = require('firebase-admin');

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

let key = (process.env.FIREBASE_PRIVATE_KEY || '').trim().replace(/\\n/g, '\n');
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: (process.env.FIREBASE_PROJECT_ID || 'shamaabidi-3ddf8').trim(),
    clientEmail: (process.env.FIREBASE_CLIENT_EMAIL || '').trim(),
    privateKey: key,
  })
});
const db = admin.firestore();

function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
}

async function syncGmailReplies() {
  console.log('Fetching sent professors from Firestore...');
  const sentSnap = await db.collection('professors')
    .where('status', 'in', ['sent', 'followup_sent'])
    .get();

  console.log(`Found ${sentSnap.size} sent professors.`);
  const professors = [];
  sentSnap.forEach(d => {
    professors.push({ id: d.id, ...d.data() });
  });

  // Also fetch sent email records to match subjects
  const emailsSnap = await db.collection('emails').get();
  const emailsByProf = new Map();
  emailsSnap.forEach(d => {
    const data = d.data();
    if (data.professorId) {
      const arr = emailsByProf.get(data.professorId) || [];
      arr.push(data);
      emailsByProf.set(data.professorId, arr);
    }
  });

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
  const lock = await client.getMailboxLock('INBOX');

  const detected = [];

  try {
    const messages = client.fetch({ seq: '1:*' }, { envelope: true, bodyStructure: true, source: true });

    for await (const msg of messages) {
      const env = msg.envelope;
      const fromObj = env.from?.[0] || {};
      const fromAddr = (fromObj.address || '').toLowerCase().trim();
      const fromName = fromObj.name || '';
      const subject = env.subject || '';
      const date = env.date;

      // Check each sent professor
      for (const prof of professors) {
        let matched = false;
        let matchReason = '';

        const profEmail = (prof.email || '').toLowerCase().trim();
        const profName = prof.name || '';
        const profUni = prof.university || '';

        // 1. Direct email match
        if (fromAddr && profEmail && fromAddr === profEmail) {
          matched = true;
          matchReason = 'Direct email match';
        }

        // 2. Subject match with sent email subjects
        if (!matched) {
          const profEmails = emailsByProf.get(prof.id) || [];
          for (const pe of profEmails) {
            if (pe.subject) {
              const cleanSentSubj = pe.subject.replace(/^(re:|fwd:|inquiry:)\s*/i, '').trim().toLowerCase();
              const cleanIncoming = subject.replace(/^(automatic reply:|re:|auto:|out of office:)\s*/i, '').trim().toLowerCase();
              if (cleanSentSubj && cleanIncoming && (cleanIncoming.includes(cleanSentSubj) || cleanSentSubj.includes(cleanIncoming))) {
                matched = true;
                matchReason = `Subject match with "${pe.subject}"`;
                break;
              }
            }
          }
        }

        // 3. Name & University domain match
        if (!matched && fromName && profName) {
          const normFromName = normalize(fromName);
          const normProfName = normalize(profName);
          // Check if last name or full name is inside fromName
          const nameParts = normProfName.split(/\s+/).filter(p => p.length > 2);
          const hasNameMatch = nameParts.some(part => normFromName.includes(part));
          if (hasNameMatch) {
            // Check if domain or alias connects to university or email
            const fromDomain = fromAddr.split('@')[1] || '';
            const profDomain = profEmail.split('@')[1] || '';
            const uniWord = normalize(profUni).split(/\s+/).find(w => w.length > 4);
            if (fromDomain.includes(profDomain) || (uniWord && (fromDomain.includes(uniWord) || fromAddr.includes(uniWord)))) {
              matched = true;
              matchReason = `Name & institution match (${fromName} @ ${fromDomain})`;
            }
          }
        }

        if (matched) {
          // Extract text snippet
          let snippet = '';
          if (msg.source) {
            const raw = msg.source.toString('utf-8');
            // Extract body text after headers
            const bodyIdx = raw.indexOf('\r\n\r\n');
            if (bodyIdx > 0) {
              snippet = raw.slice(bodyIdx + 4).replace(/<[^>]+>/g, '').replace(/[\r\n]+/g, ' ').trim().slice(0, 300);
            }
          }

          detected.push({
            profId: prof.id,
            profName: prof.name,
            profEmail: prof.email,
            fromAddr,
            fromName,
            subject,
            date,
            matchReason,
            snippet,
          });

          // Update professor in Firestore
          await db.collection('professors').doc(prof.id).update({
            status: 'replied',
            repliedAt: date || admin.firestore.FieldValue.serverTimestamp(),
            replySubject: subject,
            replyFrom: fromAddr,
            replyFromName: fromName,
            replySnippet: snippet,
            replyType: subject.toLowerCase().includes('automatic reply') || subject.toLowerCase().includes('out of office') ? 'auto_reply' : 'direct_reply',
          });

          console.log(`✅ Professor ${prof.name} (${prof.id}) marked as REPLIED via ${matchReason}!`);
          break;
        }
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }

  console.log('\nTotal detected replies:', detected.length);
  console.log(JSON.stringify(detected, null, 2));
}

syncGmailReplies().catch(console.error);
