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
    console.error('API sync-replies error:', error);
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    );
  }
}
