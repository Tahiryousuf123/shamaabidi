import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import nodemailer from 'nodemailer';
import { randomUUID } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { UserProfile, DEFAULT_PROFILE } from '@/lib/types';
import { generatePersonalizedEmail, constructFullEmailMessage } from '@/lib/email-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getTodayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { professorId, emailId, sendAll, professorIds } = body;

    // Load user profile & daily send limit
    const profileSnap = await adminDb.collection('profile').doc('main').get();
    const profile: UserProfile = profileSnap.exists
      ? ({ ...DEFAULT_PROFILE, ...profileSnap.data() } as UserProfile)
      : DEFAULT_PROFILE;
    const dailyLimit: number = profile.dailySendLimit ?? 50;

    const todayKey = getTodayKey();
    const counterRef = adminDb.collection('sendCounters').doc(todayKey);
    const counterSnap = await counterRef.get();
    let sentToday: number = counterSnap.exists ? (counterSnap.data()?.count ?? 0) : 0;

    if (sentToday >= dailyLimit) {
      return NextResponse.json(
        { error: `Daily send limit of ${dailyLimit} reached. Try again tomorrow.` },
        { status: 429 }
      );
    }

    // Build transporter
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER || 'shamaabidiphd@gmail.com',
        pass: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''),
      },
    });

    const domain = (process.env.GMAIL_USER ?? 'gmail.com').split('@')[1] ?? 'gmail.com';

    // Helper: Send to one professor
    async function sendToOneProfessor(profId: string, specificEmailId?: string) {
      const profRef = adminDb.collection('professors').doc(profId);
      const profSnap = await profRef.get();
      if (!profSnap.exists) {
        throw new Error(`Professor ${profId} not found`);
      }
      const prof = profSnap.data()!;

      if (!prof.email || !prof.email.includes('@')) {
        throw new Error(`Professor ${prof.name} has no valid email address`);
      }

      // Find or generate email draft
      let emailSubject = '';
      let emailBody = '';
      let targetEmailRef = specificEmailId ? adminDb.collection('emails').doc(specificEmailId) : null;

      if (targetEmailRef) {
        const emailSnap = await targetEmailRef.get();
        if (emailSnap.exists) {
          const emailData = emailSnap.data()!;
          emailSubject = emailData.subject;
          emailBody = emailData.body;
        } else {
          targetEmailRef = null;
        }
      }

      if (!targetEmailRef) {
        // Look for existing draft in database
        const existingSnap = await adminDb
          .collection('emails')
          .where('professorId', '==', profId)
          .where('status', '==', 'draft')
          .limit(1)
          .get();

        if (!existingSnap.empty) {
          targetEmailRef = existingSnap.docs[0].ref;
          const emailData = existingSnap.docs[0].data();
          emailSubject = emailData.subject;
          emailBody = emailData.body;
        } else {
          // Generate humanized personalized draft on the fly
          const generated = await generatePersonalizedEmail(
            prof.name,
            prof.university,
            prof.researchArea || 'clinical pharmacy practice',
            prof.recentPaper || 'recent clinical research',
            profile,
            'first'
          );
          emailSubject = generated.subject;
          emailBody = constructFullEmailMessage(generated.body, prof.name, profile);

          targetEmailRef = await adminDb.collection('emails').add({
            professorId: profId,
            type: 'first',
            subject: emailSubject,
            body: emailBody,
            status: 'draft',
            sentAt: null,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      }

      const messageId = `<${randomUUID()}@${domain}>`;

      // Build mail options
      const mailOptions: nodemailer.SendMailOptions = {
        from: `"${profile.name ?? 'Dr. Shama Abidi'}" <${process.env.GMAIL_USER || 'shamaabidiphd@gmail.com'}>`,
        to: prof.email,
        subject: emailSubject,
        text: emailBody,
        messageId,
        headers: {
          'X-PhDReach-ProfessorId': profId,
        },
      };

      // Attach CV if configured
      if (profile.cvBase64 && profile.cvFileName) {
        mailOptions.attachments = [
          {
            filename: profile.cvFileName,
            content: Buffer.from(profile.cvBase64, 'base64'),
            contentType: 'application/pdf',
          },
        ];
      }

      // Send via Gmail SMTP
      await transporter.sendMail(mailOptions);

      // Update email document
      await targetEmailRef.update({
        status: 'sent',
        sentAt: FieldValue.serverTimestamp(),
        messageId,
      });

      // Update professor status
      await profRef.update({
        status: 'sent',
        sentAt: FieldValue.serverTimestamp(),
      });

      // Increment daily counter
      sentToday++;
      if (counterSnap.exists) {
        await counterRef.update({ count: FieldValue.increment(1) });
      } else {
        await counterRef.set({ count: 1, date: todayKey });
      }

      // Log success
      await adminDb.collection('cron_logs').add({
        type: 'email_sent',
        message: `Email sent to Professor ${prof.name} (${prof.university}) at ${prof.email}`,
        createdAt: FieldValue.serverTimestamp(),
      });

      return { profId, name: prof.name, email: prof.email, messageId };
    }

    // CASE 1: Batch Send (sendAll or specific professorIds list)
    if (sendAll || (Array.isArray(professorIds) && professorIds.length > 0)) {
      let targetIds: string[] = [];

      if (Array.isArray(professorIds) && professorIds.length > 0) {
        targetIds = professorIds;
      } else {
        // Query all professors who have a valid email and haven't been sent yet
        const profsSnap = await adminDb.collection('professors').get();

        targetIds = profsSnap.docs
          .filter((d) => {
            const data = d.data();
            const hasEmail = data.email && typeof data.email === 'string' && data.email.includes('@');
            const notSent = data.status !== 'sent' && data.status !== 'followup_sent';
            return hasEmail && notSent;
          })
          .slice(0, Math.max(0, dailyLimit - sentToday))
          .map((d) => d.id);
      }

      if (targetIds.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'No pending professors with email addresses found to send.',
          sentCount: 0,
        });
      }

      const results = [];
      const errors = [];

      for (const id of targetIds) {
        if (sentToday >= dailyLimit) break;
        try {
          const res = await sendToOneProfessor(id);
          results.push(res);
          // Wait 1.5s between sends to stay within Google SMTP pacing
          await new Promise((r) => setTimeout(r, 1500));
        } catch (e: any) {
          errors.push({ profId: id, error: e?.message || 'Send failed' });
        }
      }

      return NextResponse.json({
        success: true,
        sentCount: results.length,
        results,
        errors,
        sentToday,
      });
    }

    // CASE 2: Single Professor Send
    if (!professorId) {
      return NextResponse.json(
        { error: 'professorId is required (or specify sendAll: true)' },
        { status: 400 }
      );
    }

    const result = await sendToOneProfessor(professorId, emailId);
    return NextResponse.json({ success: true, ...result, newStatus: 'sent' });
  } catch (err) {
    console.error('send error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Send failed' },
      { status: 500 }
    );
  }
}
