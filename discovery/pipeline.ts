import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  DiscoveryQuery,
  DiscoveryCandidate,
  MergedCandidate,
  PerSourceRunStats,
  DailyRunLog,
} from './types';
import { ALL_DISCOVERY_SOURCES } from './sources';
import { resolveOpenAlexAuthor, verifyFacultyPageAndEmail } from './resolver';
import { evaluateRelevance, computeCandidateMatchScore } from './relevance';
import { checkDuplicate, markAsSeen, getNameUniversityKey } from '@/lib/auto-find';
import { generatePersonalizedEmail, constructFullEmailMessage } from '@/lib/email-service';
import { DEFAULT_PROFILE, UserProfile } from '@/lib/types';

export interface PipelineExecutionOptions extends DiscoveryQuery {
  sourcesToRun?: string[]; // Specific source names to filter, or all if empty
  dryRun?: boolean; // If true, return candidates and stats without writing to Firestore
}

export interface PipelineExecutionResult {
  runId: string;
  topic: string;
  date: string;
  perSourceStats: Record<string, PerSourceRunStats>;
  totalRaw: number;
  totalPassedRelevance: number;
  totalPassedVerification: number;
  totalSaved: number;
  savedProfessors: any[];
  rejectionLog: Array<{
    name: string;
    institution: string;
    source: string;
    reason: string;
  }>;
}

export async function runProfessorDiscoveryPipeline(
  options: PipelineExecutionOptions
): Promise<PipelineExecutionResult> {
  const {
    topic,
    dateFrom,
    regions,
    limit = 20,
    sourcesToRun,
    dryRun = false,
  } = options;

  const todayIso = new Date().toISOString().slice(0, 10);
  const runId = `run_${todayIso}`;

  // Initialize per-source run tracking table
  const perSourceStats: Record<string, PerSourceRunStats> = {};
  for (const src of ALL_DISCOVERY_SOURCES) {
    perSourceStats[src.name] = {
      sourceName: src.name,
      queriesRun: 0,
      rawCandidates: 0,
      passedRelevance: 0,
      passedVerification: 0,
      saved: 0,
      errors: [],
    };
  }

  const rawCandidates: DiscoveryCandidate[] = [];
  const rejectionLog: PipelineExecutionResult['rejectionLog'] = [];

  // Filter sources if specified
  const activeSources = ALL_DISCOVERY_SOURCES.filter((s) => {
    if (!s.config.enabled) return false;
    if (sourcesToRun && sourcesToRun.length > 0) {
      return sourcesToRun.some((name) => s.name.toLowerCase().includes(name.toLowerCase()));
    }
    return true;
  });

  // 1. Run all discovery sources
  for (const src of activeSources) {
    const stats = perSourceStats[src.name];
    stats.queriesRun++;

    try {
      const candidates = await src.search({ topic, dateFrom, regions, limit });
      stats.rawCandidates += candidates.length;
      rawCandidates.push(...candidates);
    } catch (err: any) {
      const msg = `Error in ${src.name}: ${err.message}`;
      console.warn(msg);
      stats.errors.push(err.message);
    }
  }

  // 2. Relevance Filtering
  const relevancePassed: DiscoveryCandidate[] = [];
  for (const c of rawCandidates) {
    const evalRes = evaluateRelevance(c);
    const stats = perSourceStats[c.sourceName];

    if (evalRes.passed) {
      if (stats) stats.passedRelevance++;
      relevancePassed.push(c);
    } else {
      rejectionLog.push({
        name: c.name,
        institution: c.institution,
        source: c.sourceName,
        reason: `Relevance failed: ${evalRes.reason}`,
      });
    }
  }

  // 3. Entity Resolution & Cross-Source Merging
  const mergedMap = new Map<string, MergedCandidate>();

  for (const c of relevancePassed) {
    const key = c.orcid
      ? `orcid_${c.orcid.toLowerCase().replace(/[^a-z0-9]/g, '')}`
      : getNameUniversityKey(c.name, c.institution);

    if (!mergedMap.has(key)) {
      const hasGrant = Boolean(c.evidence.grantId && c.evidence.grantStatus === 'active');
      mergedMap.set(key, {
        ...c,
        sources: [c.sourceName],
        sourceCount: 1,
        discoveryConfidence: 'low',
        fundingStatus: hasGrant ? 'funded' : 'unknown',
        fundingSourceUrl: hasGrant ? c.sourceUrl : null,
        fundingEvidence: hasGrant ? `${c.evidence.fundingBody || ''} Grant: ${c.evidence.grantTitle || ''}` : null,
        fundingBody: c.evidence.fundingBody || null,
        matchScore: 75,
        relevanceScore: 0.8,
        recentPaperTitle: c.evidence.paperTitle || null,
      });
    } else {
      const existing = mergedMap.get(key)!;
      if (!existing.sources.includes(c.sourceName)) {
        existing.sources.push(c.sourceName);
        existing.sourceCount++;
      }
      // Combine evidence
      if (c.email && !existing.email) {
        existing.email = c.email;
        existing.emailSourceUrl = c.emailSourceUrl || c.sourceUrl;
      }
      if (c.orcid && !existing.orcid) {
        existing.orcid = c.orcid;
      }
      if (c.evidence.grantId && c.evidence.grantStatus === 'active') {
        existing.fundingStatus = 'funded';
        existing.fundingSourceUrl = c.sourceUrl;
        existing.fundingEvidence = `${c.evidence.fundingBody || ''} Grant: ${c.evidence.grantTitle || ''}`;
        existing.fundingBody = c.evidence.fundingBody || existing.fundingBody;
      }
      if (c.evidence.paperTitle && !existing.recentPaperTitle) {
        existing.recentPaperTitle = c.evidence.paperTitle;
      }
    }
  }

  // Set discoveryConfidence based on independent sources count
  for (const m of mergedMap.values()) {
    if (m.sourceCount >= 3) {
      m.discoveryConfidence = 'high';
    } else if (m.sourceCount === 2) {
      m.discoveryConfidence = 'medium';
    } else {
      m.discoveryConfidence = 'low';
    }
  }

  // 4. Mandatory Stage 3 Verification
  const verifiedCandidates: Array<{
    merged: MergedCandidate;
    verificationLevel: 'verified' | 'partial' | 'unverified';
    verifiedEmail: string | null;
    emailSourceUrl: string | null;
    profileSourceUrl: string | null;
  }> = [];

  // Sort merged candidates by priority: has ORCID > multi-source > funded grant > with email
  const candidateList = Array.from(mergedMap.values()).sort((a, b) => {
    const aPriority = (a.orcid ? 25 : 0) + a.sourceCount * 10 + (a.fundingStatus === 'funded' ? 15 : 0) + (a.email ? 10 : 0);
    const bPriority = (b.orcid ? 25 : 0) + b.sourceCount * 10 + (b.fundingStatus === 'funded' ? 15 : 0) + (b.email ? 10 : 0);
    return bPriority - aPriority;
  });

  const maxToVerify = Math.min(candidateList.length, Math.max(limit * 2, 25));
  const candidatesToVerify = candidateList.slice(0, maxToVerify);

  console.log(`[Pipeline] Verifying top ${candidatesToVerify.length} prioritized candidates out of ${candidateList.length} merged...`);

  for (const m of candidatesToVerify) {
    // 4a. Resolve OpenAlex Author ID & verify recent matching paper in last 3 years
    const resolved = await resolveOpenAlexAuthor(m.name, m.institution, m.orcid, topic);

    if (!resolved || (!resolved.openalexId && !resolved.orcid)) {
      rejectionLog.push({
        name: m.name,
        institution: m.institution,
        source: m.sources.join(', '),
        reason: 'Stage 3 Rejection: Could not resolve authentic OpenAlex Author ID or ORCID',
      });
      continue;
    }

    if (!resolved.hasRecentMatchingPaper) {
      rejectionLog.push({
        name: m.name,
        institution: m.institution,
        source: m.sources.join(', '),
        reason: 'Stage 3 Rejection: No peer-reviewed matching paper in last 3 years (fallback 5)',
      });
      continue;
    }

    m.openalexId = resolved.openalexId;
    m.orcid = resolved.orcid || m.orcid;
    if (resolved.displayName && resolved.displayName.length > m.name.length) {
      m.name = resolved.displayName;
    }
    if (resolved.matchedInstitution && (m.institution.includes('Institution') || m.institution.includes('Consortium') || !m.institution)) {
      m.institution = resolved.matchedInstitution;
    }
    if (resolved.matchingPaperTitle) {
      m.recentPaperTitle = resolved.matchingPaperTitle;
    }

    // 4b. Verify Official Faculty Page & Public Email
    const emailRes = await verifyFacultyPageAndEmail(
      m.name,
      m.institution,
      m.email,
      m.sourceUrl
    );

    // Compute matchScore boosts
    const hasActiveGrant = m.fundingStatus === 'funded';
    const hasPaperOverlap = Boolean(m.recentPaperTitle);
    m.matchScore = computeCandidateMatchScore(
      0.8,
      m.sourceCount,
      hasActiveGrant,
      hasPaperOverlap,
      false
    );

    // Track verification in stats
    for (const src of m.sources) {
      if (perSourceStats[src]) {
        perSourceStats[src].passedVerification++;
      }
    }

    verifiedCandidates.push({
      merged: m,
      verificationLevel: emailRes.verificationLevel,
      verifiedEmail: emailRes.verifiedEmail,
      emailSourceUrl: emailRes.emailSourceUrl,
      profileSourceUrl: emailRes.profileSourceUrl,
    });

    console.log(`[Pipeline] Verified candidate #${verifiedCandidates.length}: ${m.name} (${m.institution}) - ${emailRes.verificationLevel}`);

    if (verifiedCandidates.length >= Math.max(limit, 5)) {
      console.log(`[Pipeline] Reached target ${verifiedCandidates.length} verified candidates. Proceeding to CRM save.`);
      break;
    }
  }

  // 5. Deduplication against CRM & Firestore Saving
  const savedProfessors: any[] = [];

  let profile: UserProfile = DEFAULT_PROFILE;
  if (!dryRun) {
    try {
      const profileSnap = await adminDb.collection('profile').doc('main').get();
      if (profileSnap.exists) {
        profile = { ...DEFAULT_PROFILE, ...profileSnap.data() } as UserProfile;
      }
    } catch {}
  }

  for (const item of verifiedCandidates) {
    const { merged, verificationLevel, verifiedEmail, emailSourceUrl, profileSourceUrl } = item;

    // Deduplication check
    const dupCheck = await checkDuplicate(
      merged.openalexId,
      verifiedEmail,
      merged.orcid,
      merged.name,
      merged.institution
    );

    if (dupCheck.isDuplicate) {
      rejectionLog.push({
        name: merged.name,
        institution: merged.institution,
        source: merged.sources.join(', '),
        reason: `Deduplication: ${dupCheck.reason}`,
      });
      continue;
    }

    const isVerifiedWithEmail = verificationLevel === 'verified' && Boolean(verifiedEmail);
    const status = isVerifiedWithEmail
      ? 'draft'
      : merged.fundingStatus === 'funded'
      ? 'needs_review'
      : 'unfunded_candidate';

    const profRecord = {
      name: merged.name,
      university: merged.institution,
      country: merged.country,
      email: verifiedEmail || null,
      emailSourceUrl: emailSourceUrl || null,
      profileSourceUrl: profileSourceUrl || merged.sourceUrl,
      evidenceSnippet: merged.evidence.grantTitle || merged.evidence.paperTitle || `Discovered via ${merged.sources.join(', ')}`,
      matchReason: `Matching publication: "${merged.recentPaperTitle || merged.evidence.paperTitle}" in ${topic}`,
      fundingAvailable: merged.fundingStatus === 'funded' ? ('yes' as const) : ('unknown' as const),
      fundingSource: merged.fundingEvidence || (merged.fundingStatus === 'funded' ? 'Active Research Grant' : null),
      fundingSourceUrl: merged.fundingSourceUrl || null,
      fundingClassification: merged.fundingStatus === 'funded' ? ('fully_funded' as const) : ('unknown' as const),
      relevanceScore: merged.matchScore,
      verificationLevel,
      openAlexAuthorId: merged.openalexId,
      orcid: merged.orcid,
      recentPaper: merged.recentPaperTitle || merged.evidence.paperTitle,
      researchArea: topic,
      sourceUrl: merged.sourceUrl,
      discoverySource: 'manual' as const,
      deadline: 'rolling' as const,
      status,
      discoveryConfidence: merged.discoveryConfidence,
      sources: merged.sources,
      sourceCount: merged.sourceCount,
      sourceVerifiedDate: todayIso,
      createdAt: dryRun ? new Date() : FieldValue.serverTimestamp(),
    };

    if (!dryRun) {
      try {
        const profRef = await adminDb.collection('professors').add(profRecord);

        // If verified email, generate personalized outreach email draft
        if (isVerifiedWithEmail && verifiedEmail) {
          let emailContent: { subject: string; body: string };
          try {
            emailContent = await generatePersonalizedEmail(
              merged.name,
              merged.institution,
              topic,
              merged.recentPaperTitle || 'Recent Publication',
              profile,
              'first'
            );
          } catch {
            emailContent = {
              subject: `PhD Research Inquiry: ${topic} – ${merged.institution}`,
              body: `I am writing to respectfully inquire about prospective doctoral openings in your research group at ${merged.institution}. My clinical hospital pharmacy experience and research align directly with your work.`,
            };
          }

          const fullBody = constructFullEmailMessage(emailContent.body, merged.name, profile);

          await adminDb.collection('emails').add({
            professorId: profRef.id,
            type: 'first',
            subject: emailContent.subject,
            body: fullBody,
            status: 'draft',
            sentAt: null,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        await markAsSeen(
          merged.openalexId,
          verifiedEmail,
          merged.orcid,
          merged.name,
          merged.institution,
          'multi_source_discovery'
        );

        for (const src of merged.sources) {
          if (perSourceStats[src]) {
            perSourceStats[src].saved++;
          }
        }
      } catch (saveErr: any) {
        console.error(`Error saving professor ${merged.name}:`, saveErr);
      }
    }

    savedProfessors.push({ id: `prof_${savedProfessors.length + 1}`, ...profRecord });
  }

  // 6. Record Daily Run Log in Firestore
  const totalSaved = savedProfessors.length;
  const runLogData: DailyRunLog = {
    runId,
    date: todayIso,
    timestamp: dryRun ? new Date() : FieldValue.serverTimestamp(),
    topic,
    regions: regions || ['UK', 'Europe', 'Canada', 'Australia', 'Global'],
    sourcesRun: activeSources.map((s) => s.name),
    perSourceStats,
    totalRawCandidates: rawCandidates.length,
    totalPassedRelevance: relevancePassed.length,
    totalPassedVerification: verifiedCandidates.length,
    totalSaved,
    totalSkippedDuplicates: verifiedCandidates.length - totalSaved,
    rejectionLog: rejectionLog.slice(0, 50),
  };

  if (!dryRun) {
    try {
      await adminDb.collection('runs').doc(runId).set(runLogData, { merge: true });
    } catch (logErr) {
      console.warn('Failed to write to runs collection in Firestore:', logErr);
    }
  }

  return {
    runId,
    topic,
    date: todayIso,
    perSourceStats,
    totalRaw: rawCandidates.length,
    totalPassedRelevance: relevancePassed.length,
    totalPassedVerification: verifiedCandidates.length,
    totalSaved,
    savedProfessors,
    rejectionLog,
  };
}
