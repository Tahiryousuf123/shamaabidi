import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { ImapFlow } from 'imapflow';
import { FieldValue } from 'firebase-admin/firestore';
import { differenceInDays } from 'date-fns';
import { generatePersonalizedEmail, constructFullEmailMessage } from '@/lib/email-service';
import { DEFAULT_PROFILE, UserProfile } from '@/lib/types';
import { syncGmailRepliesAndBounces } from '@/lib/gmail-sync';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// ─── IMAP Reply and Bounce Detection ──────────────────────────────────────────

interface ImapCheckResult {
  repliedProfIds: Set<string>;
  bouncedProfIds: Set<string>;
}

async function checkRepliesAndBounces(
  emailToProfIds: Map<string, string[]>
): Promise<ImapCheckResult> {
  const result: ImapCheckResult = {
    repliedProfIds: new Set<string>(),
    bouncedProfIds: new Set<string>(),
  };

  if (emailToProfIds.size === 0) return result;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.warn('GMAIL_USER or GMAIL_APP_PASSWORD not set, skipping IMAP check');
    return result;
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
    await client.mailboxOpen('INBOX');

    // 1. Check for replies from any sent professor
    const fromAddresses = Array.from(emailToProfIds.keys());
    for (const fromAddr of fromAddresses) {
      try {
        const messages = client.fetch({ from: fromAddr }, { envelope: true });
        for await (const msg of messages) {
          const profIds = emailToProfIds.get(fromAddr.toLowerCase()) ?? [];
          for (const pid of profIds) {
            result.repliedProfIds.add(pid);
          }
          break; // One match suffices
        }
      } catch {
        // Individual address search error is non-fatal
      }
    }

    // 2. Check for bounce / delivery failure notifications
    // Mail delivery failure notices come from Mailer-Daemon or Postmaster
    try {
      // Search for messages from mailer-daemon OR postmaster
      for (const bounceFrom of ['mailer-daemon@', 'postmaster@', 'MAILER-DAEMON']) {
        try {
          const bounceMessages = client.fetch(
            { from: bounceFrom },
            { envelope: true, source: true }
          );

          for await (const msg of bounceMessages) {
            if (!msg.source) continue;
            const sourceText = msg.source.toString('utf-8');
            const emailsInBounce = sourceText.match(EMAIL_REGEX) ?? [];

            for (const foundEmail of emailsInBounce) {
              const lower = foundEmail.toLowerCase().trim();
              const profIds = emailToProfIds.get(lower) ?? [];
              for (const pid of profIds) {
                result.bouncedProfIds.add(pid);
              }
            }
          }
        } catch {
          // Individual search error is non-fatal
        }
      }
    } catch (bounceErr) {
      console.warn('Error checking delivery failure notices:', bounceErr);
    }

    await client.logout();
  } catch (err) {
    console.error('IMAP connection or inbox error:', err);
  }

  return result;
}

// ─── Main Route Handler ───────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const xCronSecret = request.headers.get('x-cron-secret');
  const secretParam = request.nextUrl.searchParams.get('secret');

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : xCronSecret || secretParam;

  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {
    repliesDetected: 0,
    bouncesDetected: 0,
    followUpsCreated: 0,
    errors: [] as string[],
  };

  try {
    // 1. Get all professors with status sent or followup_sent
    const sentSnap = await adminDb
      .collection('professors')
      .where('status', 'in', ['sent', 'followup_sent'])
      .get();

    // Build map of professor email → professorIds[]
    const emailToProfIds = new Map<string, string[]>();
    for (const doc of sentSnap.docs) {
      const data = doc.data();
      if (data.email) {
        const norm = data.email.toLowerCase().trim();
        const existing = emailToProfIds.get(norm) || [];
        existing.push(doc.id);
        emailToProfIds.set(norm, existing);
      }
    }

    // 2. Check for replies and delivery failure bounces via smart IMAP engine
    const syncRes = await syncGmailRepliesAndBounces();
    results.repliesDetected = syncRes.repliesDetected;
    results.bouncesDetected = syncRes.bouncesDetected;
    if (syncRes.errors?.length) {
      results.errors.push(...syncRes.errors);
    }

    // 3. Load profile for follow-up generation
    const profileSnap = await adminDb.collection('profile').doc('main').get();
    const profile: UserProfile = profileSnap.exists
      ? ({ ...DEFAULT_PROFILE, ...profileSnap.data() } as UserProfile)
      : DEFAULT_PROFILE;

    // 4. Check for professors that need follow-up (sent >= followupDays ago, no reply, not bounced)
    const now = new Date();
    const followupDays = typeof profile.followupDays === 'number' ? profile.followupDays : 7;
    const newlyRepliedSet = new Set(syncRes.matchedProfessors.map((p) => p.profId));

    for (const profDoc of sentSnap.docs) {
      if (newlyRepliedSet.has(profDoc.id)) continue;

      const data = profDoc.data();
      if (data.status !== 'sent') continue; // Only first-time sent, not followup_sent

      const sentAt = data.sentAt?.toDate?.();
      if (!sentAt) continue;

      const daysSinceSent = differenceInDays(now, sentAt);
      if (daysSinceSent < followupDays) continue;

      // Check if followup_draft already exists
      const existingFollowup = await adminDb
        .collection('emails')
        .where('professorId', '==', profDoc.id)
        .where('type', '==', 'followup')
        .get();
      if (!existingFollowup.empty) continue;

      try {
        const followUp = await generatePersonalizedEmail(
          data.name,
          data.university,
          data.researchArea || 'clinical pharmacy',
          data.recentPaper || 'recent research',
          profile,
          'followup'
        );

        const fullBody = constructFullEmailMessage(followUp.body, data.name, profile);

        await adminDb.collection('emails').add({
          professorId: profDoc.id,
          type: 'followup',
          subject: followUp.subject,
          body: fullBody,
          status: 'draft',
          sentAt: null,
          createdAt: FieldValue.serverTimestamp(),
        });

        await adminDb.collection('professors').doc(profDoc.id).update({
          status: 'followup_draft',
        });

        results.followUpsCreated++;
      } catch (err) {
        results.errors.push(
          `Follow-up generation failed for ${data.name}: ${err instanceof Error ? err.message : err}`
        );
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cron job failed', ...results },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, ...results });
}
