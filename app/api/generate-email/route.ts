import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { generatePersonalizedEmail, constructFullEmailMessage } from '@/lib/email-service';
import { DEFAULT_PROFILE, UserProfile } from '@/lib/types';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { professorId } = await request.json();
    if (!professorId) {
      return NextResponse.json({ error: 'professorId is required' }, { status: 400 });
    }

    // Load professor
    const profRef = adminDb.collection('professors').doc(professorId);
    const profSnap = await profRef.get();
    if (!profSnap.exists) {
      return NextResponse.json({ error: 'Professor not found' }, { status: 404 });
    }
    const prof = profSnap.data()!;

    // Load profile
    const profileSnap = await adminDb.collection('profile').doc('main').get();
    const profile: UserProfile = profileSnap.exists
      ? ({ ...DEFAULT_PROFILE, ...profileSnap.data() } as UserProfile)
      : DEFAULT_PROFILE;

    const type: 'first' | 'followup' =
      prof.status === 'followup_draft' || prof.status === 'sent' ? 'followup' : 'first';

    // Generate personalized email with Shama's CV & publications
    const emailContent = await generatePersonalizedEmail(
      prof.name,
      prof.university,
      prof.researchArea || 'clinical pharmacy',
      prof.recentPaper || 'recent research',
      profile,
      type
    );

    const fullBody = constructFullEmailMessage(emailContent.body, prof.name, profile);

    // Check for existing draft to update or create new
    const emailsRef = adminDb.collection('emails');
    const existingQ = await emailsRef
      .where('professorId', '==', professorId)
      .where('type', '==', type)
      .where('status', '==', 'draft')
      .get();

    let emailId: string;
    if (!existingQ.empty) {
      emailId = existingQ.docs[0].id;
      await emailsRef.doc(emailId).update({
        subject: emailContent.subject,
        body: fullBody,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      const newEmailRef = await emailsRef.add({
        professorId,
        type,
        subject: emailContent.subject,
        body: fullBody,
        status: 'draft',
        sentAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
      emailId = newEmailRef.id;
    }

    // Update professor status
    const newStatus = type === 'followup' ? 'followup_draft' : 'draft';
    await profRef.update({ status: newStatus });

    return NextResponse.json({
      success: true,
      emailId,
      subject: emailContent.subject,
      body: fullBody,
    });
  } catch (err) {
    console.error('generate-email error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
