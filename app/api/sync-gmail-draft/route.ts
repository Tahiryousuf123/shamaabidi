import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { syncDraftToGmail } from '@/lib/email-service';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { professorId, emailId, syncAll } = await request.json();

    if (syncAll) {
      // Sync up to 20 pending drafts to Gmail [Gmail]/Drafts folder
      const draftsSnap = await adminDb
        .collection('emails')
        .where('status', '==', 'draft')
        .limit(20)
        .get();

      let syncedCount = 0;
      for (const emailDoc of draftsSnap.docs) {
        const emailData = emailDoc.data();
        const profSnap = await adminDb.collection('professors').doc(emailData.professorId).get();
        if (profSnap.exists) {
          const profData = profSnap.data()!;
          if (profData.email) {
            const res = await syncDraftToGmail(profData.email, emailData.subject, emailData.body);
            if (res.success) syncedCount++;
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `Successfully synced ${syncedCount} draft(s) directly into your Gmail Drafts folder.`,
        syncedCount,
      });
    }

    if (!professorId) {
      return NextResponse.json({ error: 'professorId is required' }, { status: 400 });
    }

    const profSnap = await adminDb.collection('professors').doc(professorId).get();
    if (!profSnap.exists) {
      return NextResponse.json({ error: 'Professor not found' }, { status: 404 });
    }
    const prof = profSnap.data()!;

    if (!prof.email) {
      return NextResponse.json({ error: 'Professor has no email address' }, { status: 400 });
    }

    let emailData: any = null;
    if (emailId) {
      const emailSnap = await adminDb.collection('emails').doc(emailId).get();
      if (emailSnap.exists) emailData = emailSnap.data();
    }

    if (!emailData) {
      const existingQ = await adminDb
        .collection('emails')
        .where('professorId', '==', professorId)
        .where('status', '==', 'draft')
        .limit(1)
        .get();
      if (!existingQ.empty) {
        emailData = existingQ.docs[0].data();
      }
    }

    if (!emailData) {
      return NextResponse.json({ error: 'No draft email found for this professor' }, { status: 404 });
    }

    const res = await syncDraftToGmail(prof.email, emailData.subject, emailData.body);
    if (!res.success) {
      return NextResponse.json({ error: res.error || 'Failed to sync to Gmail' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Draft successfully placed in your Gmail Drafts folder (${process.env.GMAIL_USER})`,
    });
  } catch (err) {
    console.error('sync-gmail-draft error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
