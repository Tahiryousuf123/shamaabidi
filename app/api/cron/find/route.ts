import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { DEFAULT_PROFILE, UserProfile } from '@/lib/types';
import {
  discoverFundedPhDPositions,
  FUNDED_PHD_TOPICS,
  checkDuplicate,
  markAsSeen,
  getNextCombination,
  markCombinationUsed,
  getTodayFoundCount,
  TavilyQuotaError,
} from '@/lib/auto-find';
import { generatePersonalizedEmail, constructFullEmailMessage } from '@/lib/email-service';

export const maxDuration = 60; // Max allowed serverless duration on Vercel
export const dynamic = 'force-dynamic';

function verifyAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = request.headers.get('authorization');
  const xCronSecret = request.headers.get('x-cron-secret');
  const secretParam = request.nextUrl.searchParams.get('secret');

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : xCronSecret || secretParam;

  return token === cronSecret;
}

export async function GET(request: NextRequest) {
  return handleAutoFind(request);
}

export async function POST(request: NextRequest) {
  return handleAutoFind(request);
}

async function handleAutoFind(request: NextRequest) {
  // 1. Verify CRON_SECRET authorization
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized: Invalid CRON_SECRET' }, { status: 401 });
  }

  const batchIndex = parseInt(request.nextUrl.searchParams.get('batch') || '1', 10);

  try {
    // 2. Load User Profile / Auto-find settings
    const profileSnap = await adminDb.collection('profile').doc('main').get();
    const profile: UserProfile = profileSnap.exists
      ? ({ ...DEFAULT_PROFILE, ...profileSnap.data() } as UserProfile)
      : DEFAULT_PROFILE;

    const dailyTarget = Math.min(50, Math.max(1, profile.dailyFindTarget || DEFAULT_PROFILE.dailyFindTarget || 50));
    const topics = profile.topics?.length ? profile.topics : FUNDED_PHD_TOPICS;
    const countries = profile.countries?.length ? profile.countries : DEFAULT_PROFILE.countries;

    // 3. Check today's progress towards target
    const todayFound = await getTodayFoundCount();
    if (todayFound >= dailyTarget) {
      await adminDb.collection('cron_logs').add({
        type: 'auto_find',
        message: `Daily find target already achieved (${todayFound}/${dailyTarget}). Auto-find completed for today.`,
        details: { todayFound, dailyTarget, batchIndex },
        createdAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({
        success: true,
        completed: true,
        message: `Daily find target already met: found ${todayFound} of ${dailyTarget}`,
        todayFound,
        dailyTarget,
      });
    }

    const startTime = Date.now();
    const MAX_RUN_TIME_MS = 45000; // 45s safety cutoff within 60s serverless limit

    let addedVerified = 0;
    let addedNeedsReview = 0;
    let skippedDuplicates = 0;
    let combinationsProcessed = 0;
    let currentFound = todayFound;
    let lastCombo: any = null;

    const todayIso = new Date().toISOString().slice(0, 10);

    while (currentFound < dailyTarget && Date.now() - startTime < MAX_RUN_TIME_MS) {
      // Select next rotated topic x country combination using lastUsed
      const combo = await getNextCombination(topics, countries);
      if (!combo) break;
      lastCombo = combo;
      combinationsProcessed++;

      const needed = dailyTarget - currentFound;
      const searchLimit = Math.min(10, Math.max(5, needed));

      // FUNDING-FIRST: Discover funded PhD positions directly via Tavily
      let discovery;
      try {
        discovery = await discoverFundedPhDPositions(combo.topic, combo.country, searchLimit);
      } catch (tavErr) {
        if (tavErr instanceof TavilyQuotaError) {
          await adminDb.collection('cron_logs').add({
            type: 'quota_error',
            message: `Auto-Find Tavily Quota Error: ${tavErr.message}. Stopped immediately without guessing.`,
            details: { combo, batchIndex, combinationsProcessed },
            createdAt: FieldValue.serverTimestamp(),
          });
          return NextResponse.json(
            { error: tavErr.message, quotaError: true, combo, batchIndex },
            { status: 429 }
          );
        }
        throw tavErr;
      }

      let comboAdded = 0;

      for (const item of discovery.accepted) {
        const { ad, verifiedEmail, emailSourceUrl, verificationLevel, matchReason, relevanceScore } = item;

        // Deduplication check
        const dupCheck = await checkDuplicate(
          null,
          verifiedEmail,
          null,
          ad.supervisorName || ad.title,
          ad.university
        );

        if (dupCheck.isDuplicate) {
          skippedDuplicates++;
          continue;
        }

        const isExpired = Boolean(ad.deadlineDate && ad.deadlineDate < todayIso);

        if (verificationLevel === 'verified' && verifiedEmail) {
          // Verified: generate personalized draft
          let emailContent: { subject: string; body: string };
          try {
            emailContent = await generatePersonalizedEmail(
              ad.supervisorName || 'Professor',
              ad.university,
              combo.topic,
              ad.title,
              profile,
              'first'
            );
          } catch {
            emailContent = {
              subject: `PhD Research Inquiry: ${ad.title.slice(0, 50)} – ${ad.university}`,
              body: `I am writing to respectfully inquire about the funded PhD opportunity "${ad.title}" in your research group at ${ad.university}. My 17+ years of hospital pharmacy practice and research in ${combo.topic} strongly connect with this project.`,
            };
          }

          const fullBody = constructFullEmailMessage(emailContent.body, ad.supervisorName || 'Professor', profile);

          const profRef = await adminDb.collection('professors').add({
            name: ad.supervisorName || `PhD Supervisor (${ad.university})`,
            university: ad.university || 'Target University',
            country: combo.country,
            email: verifiedEmail,
            emailSourceUrl: emailSourceUrl || ad.adUrl,
            profileSourceUrl: ad.adUrl,
            evidenceSnippet: ad.rawText.slice(0, 400),
            matchReason,
            fundingAvailable: 'yes',
            fundingSource: ad.fundingType || 'Fully Funded PhD Studentship',
            fundingSourceUrl: ad.adUrl,
            fundingType: ad.fundingType,
            fundingAmount: ad.fundingAmount,
            fundingClassification: ad.fundingClassification || 'unknown',
            tuitionCoverage: ad.tuitionCoverage || 'unknown',
            stipendDuration: ad.stipendDuration || null,
            internationalEligibility: ad.internationalEligibility || 'unknown',
            eligibilitySnippet: ad.eligibilitySnippet,
            englishRequirements: ad.englishRequirements || null,
            intendedIntake: ad.intendedIntake || null,
            programName: ad.programName || null,
            requiredQualifications: ad.requiredQualifications || null,
            officialApplicationUrl: ad.officialApplicationUrl || null,
            sourceVerifiedDate: todayIso,
            relevanceScore,
            adUrl: ad.adUrl,
            hasFundingAd: true,
            discoverySource: 'funding_ad',
            deadline: ad.deadline || 'not_stated',
            deadlineDate: ad.deadlineDate,
            deadlineSourceUrl: ad.adUrl,
            isExpired,
            verificationLevel: 'verified',
            recentPaper: ad.title,
            researchArea: combo.topic,
            sourceUrl: ad.adUrl,
            status: 'draft',
            sentAt: null,
            createdAt: FieldValue.serverTimestamp(),
          });

          await adminDb.collection('emails').add({
            professorId: profRef.id,
            type: 'first',
            subject: emailContent.subject,
            body: fullBody,
            status: 'draft',
            sentAt: null,
            createdAt: FieldValue.serverTimestamp(),
          });

          await markAsSeen(
            null,
            verifiedEmail,
            null,
            ad.supervisorName || ad.title,
            ad.university,
            'verified_funded_ad'
          );

          addedVerified++;
          comboAdded++;
          currentFound++;
        } else {
          // Needs review (email unverified on official domain)
          await adminDb.collection('professors').add({
            name: ad.supervisorName || `PhD Supervisor (${ad.university})`,
            university: ad.university || 'Target University',
            country: combo.country,
            email: null,
            emailSourceUrl: null,
            profileSourceUrl: ad.adUrl,
            evidenceSnippet: ad.rawText.slice(0, 400),
            matchReason,
            fundingAvailable: 'yes',
            fundingSource: ad.fundingType || 'Funded PhD Position',
            fundingSourceUrl: ad.adUrl,
            fundingType: ad.fundingType,
            fundingAmount: ad.fundingAmount,
            fundingClassification: ad.fundingClassification || 'unknown',
            tuitionCoverage: ad.tuitionCoverage || 'unknown',
            stipendDuration: ad.stipendDuration || null,
            internationalEligibility: ad.internationalEligibility || 'unknown',
            eligibilitySnippet: ad.eligibilitySnippet,
            englishRequirements: ad.englishRequirements || null,
            intendedIntake: ad.intendedIntake || null,
            programName: ad.programName || null,
            requiredQualifications: ad.requiredQualifications || null,
            officialApplicationUrl: ad.officialApplicationUrl || null,
            sourceVerifiedDate: todayIso,
            relevanceScore,
            adUrl: ad.adUrl,
            hasFundingAd: true,
            discoverySource: 'funding_ad',
            deadline: ad.deadline || 'not_stated',
            deadlineDate: ad.deadlineDate,
            deadlineSourceUrl: ad.adUrl,
            isExpired,
            verificationLevel: 'unverified',
            recentPaper: ad.title,
            researchArea: combo.topic,
            sourceUrl: ad.adUrl,
            status: 'needs_review',
            sentAt: null,
            createdAt: FieldValue.serverTimestamp(),
          });

          await markAsSeen(
            null,
            null,
            null,
            ad.supervisorName || ad.title,
            ad.university,
            'needs_review_funded_ad'
          );

          addedNeedsReview++;
          comboAdded++;
          currentFound++;
        }
      }

      // Mark combination used
      await markCombinationUsed(combo.docId, comboAdded);

      // Check time limit
      if (Date.now() - startTime >= MAX_RUN_TIME_MS) {
        break;
      }
    }

    const totalAdded = addedVerified + addedNeedsReview;

    // Record in cron_logs
    await adminDb.collection('cron_logs').add({
      type: 'auto_find',
      message: `FUNDING-FIRST Auto-Find at 12:00 AM (batch #${batchIndex}) processed ${combinationsProcessed} combinations. Added: ${totalAdded} (Verified: ${addedVerified}, Needs Review: ${addedNeedsReview}). Total today: ${currentFound}/${dailyTarget}.`,
      details: {
        lastCombo,
        batchIndex,
        combinationsProcessed,
        addedVerified,
        addedNeedsReview,
        skippedDuplicates,
        currentFound,
        dailyTarget,
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    // Check if next batch should chain to reach the 50 daily target
    const canChain = currentFound < dailyTarget && batchIndex < 15;
    if (canChain) {
      triggerNextBatch(request, batchIndex + 1);
    }

    return NextResponse.json({
      success: true,
      batchIndex,
      combinationsProcessed,
      lastCombo,
      addedVerified,
      addedNeedsReview,
      skippedDuplicates,
      todayFound: currentFound,
      dailyTarget,
      chained: canChain,
    });
  } catch (err) {
    console.error('Auto-find cron failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown auto-find error', batchIndex },
      { status: 500 }
    );
  }
}

function triggerNextBatch(request: NextRequest, nextBatch: number): void {
  const cronSecret = process.env.CRON_SECRET || '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const targetUrl = `${appUrl}/api/cron/find?batch=${nextBatch}`;

  fetch(targetUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      'x-cron-secret': cronSecret,
    },
  }).catch((err) => {
    console.warn(`Failed to chain auto-find batch #${nextBatch}:`, err);
  });
}
