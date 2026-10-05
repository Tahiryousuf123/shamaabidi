import { NextRequest, NextResponse } from 'next/server';
import { getTotalStats } from '@/lib/auto-find';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const stats = await getTotalStats();

    // Also get last 5 cron logs
    const logsSnap = await adminDb
      .collection('cron_logs')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();

    const recentLogs = logsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        type: data.type,
        message: data.message,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      };
    });

    // Get current rotated combination info
    const combosSnap = await adminDb
      .collection('search_combinations')
      .orderBy('lastUsed', 'asc')
      .limit(1)
      .get();

    const nextCombo = !combosSnap.empty ? combosSnap.docs[0].data() : null;

    return NextResponse.json({
      success: true,
      stats,
      nextCombination: nextCombo
        ? { topic: nextCombo.topic, country: nextCombo.country }
        : null,
      recentLogs,
    });
  } catch (err) {
    console.error('Stats fetch error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
