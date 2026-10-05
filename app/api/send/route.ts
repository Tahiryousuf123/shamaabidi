import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import nodemailer from 'nodemailer';
import { randomUUID } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';

function getTodayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function POST(request: NextRequest) {
  try {
    const { professorId, emailId } = await request.json();
    if (!professorId || !emailId) {
      return NextResponse.json({ error: 'professorId and emailId are required' }, { status: 400 });
    }

    // Check daily send limit
    const profileSnap = await adminDb.collection('profile').doc('main').get();
    const profile = profileSnap.data() ?? {};
    const dailyLimit: number = profile.dailySendLimit ?? 20;

    const todayKey = getTodayKey();
    const counterRef = adminDb.collection('sendCounters').doc(todayKey);
    const counterSnap = await counterRef.get();
    const sentToday: number = counterSnap.exists ? (counterSnap.data()?.count ?? 0) : 0;

    if (sentToday >= dailyLimit) {
      return NextResponse.json(
        { error: `Daily send limit of ${dailyLimit} reached. Try again tomorrow.` },
        { status: 429 }
      );
    }

    // Load professor
    const profRef = adminDb.collection('professors').doc(professorId);
    const profSnap = await profRef.get();
    if (!profSnap.exists) {
      return NextResponse.json({ error: 'Professor not found' }, { status: 404 });
    }
    const prof = profSnap.data()!;

    if (!prof.email) {
      return NextResponse.json({ error: 'No email address for this professor' }, { status: 400 });
    }

    // Load email draft
    const emailRef = adminDb.collection('emails').doc(emailId);
    const emailSnap = await emailRef.get();
    if (!emailSnap.exists) {
      return NextResponse.json({ error: 'Email draft not found' }, { status: 404 });
    }
    const emailData = emailSnap.data()!;

    // Build message-id for reply tracking
    const domain = (process.env.GMAIL_USER ?? 'gmail.com').split('@')[1] ?? 'gmail.com';
    const messageId = `<${randomUUID()}@${domain}>`;

    // Build transporter
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    // Build mail options
    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${profile.name ?? 'Shama Abidi'}" <${process.env.GMAIL_USER}>`,
      to: prof.email,
      subject: emailData.subject,
      text: emailData.body,
      messageId,
      headers: {
        'X-PhDReach-ProfessorId': professorId,
      },
    };

    // Attach CV if available
    if (profile.cvBase64 && profile.cvFileName) {
      mailOptions.attachments = [
        {
          filename: profile.cvFileName,
          content: Buffer.from(profile.cvBase64, 'base64'),
          contentType: 'application/pdf',
        },
      ];
    }

    // Send
    await transporter.sendMail(mailOptions);

    // Update email document
    await emailRef.update({
      status: 'sent',
      sentAt: FieldValue.serverTimestamp(),
      messageId,
    });

    // Update professor status
    const newStatus = emailData.type === 'followup' ? 'followup_sent' : 'sent';
    await profRef.update({
      status: newStatus,
      sentAt: FieldValue.serverTimestamp(),
    });

    // Increment daily counter
    if (counterSnap.exists) {
      await counterRef.update({ count: FieldValue.increment(1) });
    } else {
      await counterRef.set({ count: 1, date: todayKey });
    }

    return NextResponse.json({ success: true, messageId, newStatus });
  } catch (err) {
    console.error('send error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Send failed' },
      { status: 500 }
    );
  }
}
