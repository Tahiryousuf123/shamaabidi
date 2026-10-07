import { NextRequest, NextResponse } from 'next/server';
import { syncGmailRepliesAndBounces } from '@/lib/gmail-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}

async function handleSync(_req: NextRequest) {
  try {
    const result = await syncGmailRepliesAndBounces();
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    const isQuota = error?.message?.includes('RESOURCE_EXHAUSTED') || error?.code === 8;
    console.error('API sync-replies error:', error);
    return NextResponse.json(
      {
        error: isQuota
          ? 'Firebase Firestore daily free quota (50,000 reads) exceeded for today. Upgrading to the Blaze plan (pay-as-you-go, retains free 50k/day) unblocks this immediately.'
          : error.message || 'Sync failed',
        quotaExhausted: isQuota,
      },
      { status: isQuota ? 429 : 500 }
    );
  }
}
