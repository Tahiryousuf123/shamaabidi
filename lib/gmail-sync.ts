import { ImapFlow } from 'imapflow';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export interface SyncResult {
  repliesDetected: number;
  bouncesDetected: number;
  matchedProfessors: Array<{
    profId: string;
    profName: string;
    profEmail: string;
    fromAddr: string;
    fromName: string;
    subject: string;
    replyType: 'auto_reply' | 'direct_reply';
    snippet: string;
  }>;
  errors: string[];
}

function cleanBodySnippet(rawSource: string): string {
  if (!rawSource) return '';
  try {
    // Find double newline marking header separation
    let body = rawSource;
    const bodyIdx = rawSource.indexOf('\r\n\r\n');
    if (bodyIdx > 0) {
      body = rawSource.slice(bodyIdx + 4);
    }
    // Remove multipart boundaries
    body = body.replace(/--[a-zA-Z0-9_\-.]+/g, '');
    // Remove header remnants
    body = body.replace(/Content-Type:[^\r\n]+/gi, '');
    body = body.replace(/Content-Transfer-Encoding:[^\r\n]+/gi, '');
    body = body.replace(/charset="?[^"\r\n]+"?/gi, '');
    // Remove HTML tags
    body = body.replace(/<[^>]+>/g, ' ');
    // Remove quoted printable equal signs at end of line
    body = body.replace(/=\r?\n/g, '');
    // Collapse whitespace
    body = body.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    return body.slice(0, 300);
  } catch {
    return '';
  }
}

function normalize(str: string): string {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
}

export async function syncGmailRepliesAndBounces(): Promise<SyncResult> {
  const result: SyncResult = {
    repliesDetected: 0,
    bouncesDetected: 0,
    matchedProfessors: [],
    errors: [],
  };

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    result.errors.push('GMAIL_USER or GMAIL_APP_PASSWORD is not configured');
    return result;
  }

  // 1. Fetch all sent / followup_sent professors
  const sentSnap = await adminDb
    .collection('professors')
    .where('status', 'in', ['sent', 'followup_sent'])
    .get();

  if (sentSnap.empty) {
    return result;
  }

  const sentProfessors = sentSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as any[];

  // 2. Fetch email docs to cross-reference sent subjects
  const emailsSnap = await adminDb.collection('emails').get();
  const emailsByProf = new Map<string, any[]>();
  emailsSnap.docs.forEach((d) => {
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
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const messages = client.fetch({ seq: '1:*' }, {
        envelope: true,
        source: true,
      });

      for await (const msg of messages) {
        const env = msg.envelope;
        if (!env) continue;

        const fromObj = env.from?.[0] || {};
        const fromAddr = (fromObj.address || '').toLowerCase().trim();
        const fromName = fromObj.name || '';
        const subject = env.subject || '';
        const inReplyTo = env.inReplyTo || '';
        const date = env.date || new Date();

        // Check for bounce notices
        const isBounceSender =
          fromAddr.includes('mailer-daemon') ||
          fromAddr.includes('postmaster') ||
          subject.toLowerCase().includes('delivery status notification (failure)') ||
          subject.toLowerCase().includes('undeliverable:');

        if (isBounceSender && msg.source) {
          const raw = msg.source.toString('utf-8');
          for (const prof of sentProfessors) {
            const pEmail = (prof.email || '').toLowerCase().trim();
            if (pEmail && raw.toLowerCase().includes(pEmail)) {
              await adminDb.collection('professors').doc(prof.id).update({
                status: 'bounced',
                bouncedAt: date,
                bounceReason: subject,
              });
              result.bouncesDetected++;
              break;
            }
          }
          continue;
        }

        // Check each sent professor for a reply
        for (const prof of sentProfessors) {
          let matched = false;
          let matchReason = '';

          const profEmail = (prof.email || '').toLowerCase().trim();
          const profName = prof.name || '';
          const profUni = prof.university || '';

          // A. Direct email match
          if (fromAddr && profEmail && fromAddr === profEmail) {
            matched = true;
            matchReason = 'Direct email match';
          }

          // B. Subject match against sent emails
          if (!matched) {
            const profEmails = emailsByProf.get(prof.id) || [];
            for (const pe of profEmails) {
              if (pe.subject) {
                const cleanSentSubj = pe.subject
                  .replace(/^(re:|fwd:|inquiry:)\s*/i, '')
                  .trim()
                  .toLowerCase();
                const cleanIncoming = subject
                  .replace(/^(automatic reply:|re:|auto:|out of office:)\s*/i, '')
                  .trim()
                  .toLowerCase();

                if (
                  cleanSentSubj.length > 8 &&
                  cleanIncoming.length > 8 &&
                  (cleanIncoming.includes(cleanSentSubj) || cleanSentSubj.includes(cleanIncoming))
                ) {
                  matched = true;
                  matchReason = `Subject match with "${pe.subject}"`;
                  break;
                }
              }
            }
          }

          // C. In-Reply-To match
          if (!matched && inReplyTo) {
            const profEmails = emailsByProf.get(prof.id) || [];
            for (const pe of profEmails) {
              if (pe.messageId && inReplyTo.includes(pe.messageId.replace(/[<>\s]/g, ''))) {
                matched = true;
                matchReason = 'In-Reply-To message ID match';
                break;
              }
            }
          }

          // D. Name and University institution correlation
          if (!matched && fromName && profName) {
            const normFromName = normalize(fromName);
            const normProfName = normalize(profName);
            const nameParts = normProfName.split(/\s+/).filter((p: string) => p.length > 2);
            const hasNameMatch = nameParts.some((part: string) => normFromName.includes(part));

            if (hasNameMatch) {
              const fromDomain = fromAddr.split('@')[1] || '';
              const profDomain = profEmail.split('@')[1] || '';
              const uniWord = normalize(profUni).split(/\s+/).find((w: string) => w.length > 4);

              if (
                fromDomain.includes(profDomain) ||
                (uniWord && (fromDomain.includes(uniWord) || fromAddr.includes(uniWord)))
              ) {
                matched = true;
                matchReason = `Name & institution domain match (${fromName} @ ${fromDomain})`;
              }
            }
          }

          if (matched) {
            const snippet = msg.source ? cleanBodySnippet(msg.source.toString('utf-8')) : '';
            const isAuto =
              subject.toLowerCase().includes('automatic reply') ||
              subject.toLowerCase().includes('out of office') ||
              subject.toLowerCase().includes('auto:');
            const replyType: 'auto_reply' | 'direct_reply' = isAuto ? 'auto_reply' : 'direct_reply';

            await adminDb.collection('professors').doc(prof.id).update({
              status: 'replied',
              repliedAt: date,
              replySubject: subject,
              replyFrom: fromAddr,
              replyFromName: fromName,
              replySnippet: snippet,
              replyType,
            });

            await adminDb.collection('cron_logs').add({
              type: 'reply_check',
              message: `Reply received from Professor ${prof.name} (${prof.university}) [${matchReason}]`,
              details: {
                professorId: prof.id,
                subject,
                from: fromAddr,
                replyType,
              },
              createdAt: FieldValue.serverTimestamp(),
            });

            result.repliesDetected++;
            result.matchedProfessors.push({
              profId: prof.id,
              profName: prof.name,
              profEmail: prof.email,
              fromAddr,
              fromName,
              subject,
              replyType,
              snippet,
            });

            break;
          }
        }
      }
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err: any) {
    console.error('Gmail sync error:', err);
    result.errors.push(err.message || 'IMAP sync failure');
  }

  return result;
}
