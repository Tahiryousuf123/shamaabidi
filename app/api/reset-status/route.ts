import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { professorId } = body;

    if (!professorId) {
      return NextResponse.json({ error: 'professorId is required' }, { status: 400 });
    }

    const profRef = adminDb.collection('professors').doc(professorId);
    const profSnap = await profRef.get();
    if (!profSnap.exists) {
      return NextResponse.json({ error: 'Professor not found' }, { status: 404 });
    }

    // Reset professor status back to draft
    await profRef.update({
      status: 'draft',
      sentAt: FieldValue.delete(),
    });

    // Reset associated email records to draft
    const emailsSnap = await adminDb
      .collection('emails')
      .where('professorId', '==', professorId)
      .get();

    if (!emailsSnap.empty) {
      const batch = adminDb.batch();
      emailsSnap.docs.forEach((doc) => {
        batch.update(doc.ref, {
          status: 'draft',
          sentAt: FieldValue.delete(),
        });
      });
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      message: 'Status reset to draft. Professor is ready to send again.',
    });
  } catch (error: any) {
    console.error('Reset status error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reset professor status' },
      { status: 500 }
    );
  }
}
