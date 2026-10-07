import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { runProfessorDiscoveryPipeline } from '@/discovery/pipeline';
import { SHAMA_TOPIC_SEEDS } from '@/discovery/config';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const runsSnap = await adminDb
      .collection('runs')
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();

    const runs = runsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ success: true, runs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const topic = body.topic || SHAMA_TOPIC_SEEDS[0];
    const limit = body.limit ? parseInt(body.limit, 10) : 10;
    const sourcesToRun = body.sourcesToRun;
    const dryRun = Boolean(body.dryRun);

    const result = await runProfessorDiscoveryPipeline({
      topic,
      limit,
      sourcesToRun,
      dryRun,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Discovery pipeline route error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown discovery error' },
      { status: 500 }
    );
  }
}
