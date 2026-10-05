import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'TAVILY_API_KEY not configured' }, { status: 500 });
  }

  try {
    const res = await fetch('https://api.tavily.com/usage', {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `Tavily API error: ${res.status}`, details: errText },
        { status: res.status }
      );
    }

    const data = await res.json();
    const planUsage = data?.key?.usage ?? data?.account?.plan_usage ?? 0;
    const planLimit = data?.account?.plan_limit ?? null;
    const planName = data?.account?.current_plan ?? 'Standard';

    return NextResponse.json({
      success: true,
      usage: planUsage,
      limit: planLimit,
      plan: planName,
      raw: data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch Tavily usage' },
      { status: 500 }
    );
  }
}
