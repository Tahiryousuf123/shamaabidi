import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { DEFAULT_PROFILE, UserProfile } from '@/lib/types';
import {
  discoverFundedPhDPositions,
  checkDuplicate,
  markAsSeen,
  TavilyQuotaError,
} from '@/lib/auto-find';
import { generatePersonalizedEmail, constructFullEmailMessage } from '@/lib/email-service';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const { topic, country, includeOpenAlex } = await request.json();
  if (!topic) {
    return NextResponse.json({ error: 'topic is required' }, { status: 400 });
  }

  const errors: string[] = [];
  let addedVerified = 0;
  let addedNeedsReview = 0;
  let skippedDuplicates = 0;
  let quotaErrorOccurred = false;

  try {
    // 1. FUNDING-FIRST: Search for active funded PhD positions across FindAPhD, jobs.ac.uk, Euraxess, academic domains
    const discovery = await discoverFundedPhDPositions(topic, country ?? '', 10);

    // 2. Load User Profile
    const profileSnap = await adminDb.collection('profile').doc('main').get();
    const profile: UserProfile = profileSnap.exists
      ? ({ ...DEFAULT_PROFILE, ...profileSnap.data() } as UserProfile)
      : DEFAULT_PROFILE;

    const todayIso = new Date().toISOString().slice(0, 10);

    // 3. Process Accepted Funded Advertisements
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
        // Generate personalized inquiry email draft
        let emailContent: { subject: string; body: string };
        try {
          emailContent = await generatePersonalizedEmail(
            ad.supervisorName || 'Professor',
            ad.university,
            topic,
            ad.title,
            profile,
            'first'
          );
        } catch {
          emailContent = {
            subject: `PhD Research Inquiry: ${ad.title.slice(0, 50)} – ${ad.university}`,
            body: `I am writing to respectfully inquire about the funded PhD opportunity "${ad.title}" in your group at ${ad.university}. My 17+ years of hospital pharmacy practice and research in ${topic} directly align with this project.`,
          };
        }

        const fullBody = constructFullEmailMessage(emailContent.body, ad.supervisorName || 'Professor', profile);

        // Save verified professor record
        const profRef = await adminDb.collection('professors').add({
          name: ad.supervisorName || `PhD Supervisor (${ad.university})`,
          university: ad.university || 'Target University',
          country: country || 'International',
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
          researchArea: topic,
          sourceUrl: ad.adUrl,
          status: 'draft',
          sentAt: null,
          createdAt: FieldValue.serverTimestamp(),
        });

        // Save email draft
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
      } else {
        // Email unverified or not found on official university page: NEVER guess
        await adminDb.collection('professors').add({
          name: ad.supervisorName || `PhD Supervisor (${ad.university})`,
          university: ad.university || 'Target University',
          country: country || 'International',
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
          researchArea: topic,
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
      }
    }

    return NextResponse.json({
      success: true,
      addedVerified,
      addedNeedsReview,
      added: addedVerified + addedNeedsReview,
      skipped: skippedDuplicates,
      totalSearched: discovery.totalSearched,
      acceptedCount: discovery.accepted.length,
      rejectedCount: discovery.rejected.length,
      accepted: discovery.accepted.map((item) => ({
        title: item.ad.title,
        url: item.ad.adUrl,
        supervisor: item.ad.supervisorName,
        university: item.ad.university,
        funding: item.ad.fundingType,
        fundingAmount: item.ad.fundingAmount,
        eligibility: item.ad.eligibilitySnippet,
        deadline: item.ad.deadline,
        email: item.verifiedEmail,
        verificationLevel: item.verificationLevel,
        matchReason: item.matchReason,
        relevanceScore: item.relevanceScore,
      })),
      rejected: discovery.rejected.map((item) => ({
        title: item.ad.title,
        url: item.ad.adUrl,
        reason: item.rejectionReason,
      })),
      quotaError: quotaErrorOccurred,
      errors,
    });
  } catch (err) {
    if (err instanceof TavilyQuotaError) {
      await adminDb.collection('cron_logs').add({
        type: 'quota_error',
        message: `Find Tavily Quota Error: ${err.message}`,
        createdAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ error: err.message, quotaError: true }, { status: 429 });
    }

    console.error('Find route error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error during funded PhD discovery' },
      { status: 500 }
    );
  }
}
