export interface Professor {
  id?: string;
  name: string;
  university: string;
  country: string;
  email: string | null;
  emailSourceUrl: string | null;
  profileSourceUrl: string | null;
  evidenceSnippet: string | null; // the exact text from the page where the email/funding was found
  matchReason: string; // title of one of their papers matching Shama's research themes
  fundingAvailable: 'yes' | 'no' | 'unknown';
  fundingSource: string | null; // e.g. university scholarship, research council, grant name
  fundingSourceUrl: string | null;
  fundingType?: string | null; // e.g. 'Fully funded', 'PhD Studentship', 'Scholarship', 'Stipend'
  fundingAmount?: string | null; // literal amount/stipend e.g. '£21,805 per annum'
  fundingClassification?: 'fully_funded' | 'partially_funded' | 'unfunded' | 'unknown';
  tuitionCoverage?: 'full' | 'partial' | 'none' | 'unknown';
  stipendDuration?: string | null; // e.g. '3.5 years', '4 years'
  internationalEligibility?: 'eligible' | 'home_eu_only' | 'needs_review' | 'unknown';
  eligibilitySnippet?: string | null; // literal text checking international student eligibility
  englishRequirements?: string | null; // e.g. 'IELTS 6.5 minimum', 'Exemption for degree taught in English'
  intendedIntake?: string | null; // e.g. 'October 2026', 'Spring 2027'
  programName?: string | null; // PhD programme title / research field
  requiredQualifications?: string | null; // e.g. 'MPhil / Master's degree'
  officialApplicationUrl?: string | null;
  sourceVerifiedDate?: string | null; // ISO YYYY-MM-DD
  relevanceScore?: number; // 0-100 relevance to Shama's themes
  adUrl?: string | null; // direct source URL of the funded PhD advertisement
  hasFundingAd?: boolean; // true if found from an active funded ad, false if from OpenAlex only
  discoverySource?: 'funding_ad' | 'openalex_only' | 'manual';
  deadline: string | 'rolling' | 'not_stated';
  deadlineDate?: string | null; // ISO YYYY-MM-DD for sorting & 30-day highlight
  deadlineSourceUrl: string | null;
  isExpired?: boolean;
  verificationLevel: 'verified' | 'partial' | 'unverified';
  openAlexAuthorId?: string | null;
  orcid?: string | null;
  recentPaper?: string;
  researchArea?: string;
  sourceUrl?: string; // backwards compatibility alias for emailSourceUrl
  status:
    | 'new'
    | 'draft'
    | 'needs_review'
    | 'sent'
    | 'followup_draft'
    | 'followup_sent'
    | 'replied'
    | 'bounced'
    | 'email_not_found'
    | 'unfunded_candidate';
  sentAt?: Date | null;
  createdAt: Date;
}

export interface Email {
  id?: string;
  professorId: string;
  type: 'first' | 'followup';
  subject: string;
  body: string;
  status: 'draft' | 'sent';
  sentAt?: Date | null;
  messageId?: string;
}

export interface UserProfile {
  name: string;
  email: string;
  background: string;
  researchInterests: string;
  publications?: string;
  papers: string[];
  themes: string[];
  dailySendLimit: number;
  dailyFindTarget: number;
  followupDays?: number;
  topics: string[];
  countries: string[];
  cvFileName?: string;
  cvBase64?: string;
  updatedAt?: Date;
}

export interface SearchCombination {
  id: string;
  topic: string;
  country: string;
  lastUsed: Date | null;
  timesUsed: number;
  lastFoundCount: number;
}

export interface CronLog {
  id?: string;
  type: 'auto_find' | 'quota_error' | 'reply_check' | 'bounce_detected';
  message: string;
  details?: Record<string, any>;
  createdAt: Date;
}

// ─── Shama's Verified Research Papers & Core Themes ───────────────────────────

export const SHAMA_RESEARCH_PAPERS = [
  'Effectiveness and safety assessment of calcium channel blockers compared to beta blockers in patients with angina',
  'Evaluation of carbapenem antimicrobial stewardship program at a tertiary care hospital',
  'AI meets human expertise: clinical pharmacist interventions vs artificial intelligence at a tertiary care hospital',
  'Evaluating knowledge of high-alert medications among nurses, pharmacists and clinicians',
  'Evidence based pharmacy practice in Pakistan: knowledge, attitudes and implementation barriers',
];

export const SHAMA_RESEARCH_THEMES = [
  'clinical pharmacy',
  'medication safety',
  'high-alert medications',
  'antimicrobial stewardship and resistance',
  'evidence-based pharmacy practice',
  'implementation science',
  'hospital pharmacy services',
  'AI/digital clinical decision support',
];

export const DEFAULT_PROFILE: UserProfile = {
  name: 'Shama Abidi',
  email: 'shamaabidiphd@gmail.com',
  background:
    'MPhil Pharmacy Practice (University of Karachi, 2024), PharmD (2019), B-Pharm (2007). Senior Clinical Pharmacist at Liaquat National Hospital & Medical College Karachi since 2007. Lead clinical pharmacist in Antimicrobial Stewardship (ASP) since 2018, conducting ICU/HDU prospective interventional audits, renal/hepatic dose adjustments, and high-alert medication safety. Vice President, Pakistan Pharmacist Association (PPA) Sindh Cabinet. Seeking a fully-funded international PhD position in Clinical Pharmacy, Antimicrobial Stewardship, or Medication Safety.',
  researchInterests:
    'Antimicrobial stewardship and resistance; clinical pharmacy and medication safety; evidence-based pharmacy practice and implementation science; cardiovascular pharmacotherapy; AI and clinical decision support systems in hospital pharmacy.',
  publications:
    '1. Abidi S, Saeed Khan S, et al. (2024). Effectiveness and safety assessment of calcium channel blockers compared to beta blockers in patients with angina: An observational study. Pak J Pharm Sci, 37(3):639-649.\n2. Ali F, Zehra T, Siddiqui HA, Abidi S. (2022). Evaluation of carbapenem antimicrobial stewardship program at a tertiary care hospital: A prospective interventional study. Pak J Pharm Sci, 35(6):1595-1601.\n3. Baig F, Siddiqui HA, Bilekhia A, Abidi S, Ahmed S. (2025). AI meets human expertise: Comparison between clinical pharmacist interventions and artificial intelligence at a tertiary care hospital in Pakistan. J Pharm Policy Pract, 18(Suppl 2).\n4. Baig F, Bilekhia A, Abidi S, Ahmed S. (2025). Evaluating knowledge of high-alert medications among nurses, pharmacists, and clinicians to improve medication safety. J Pharm Policy Pract, 18(Suppl 2).\n5. Khadim S, Abidi S, et al. (2020). Corrective measures against invincible XDR typhoid fever. Pak J Pharm Sci, 37(1):27-33.',
  papers: SHAMA_RESEARCH_PAPERS,
  themes: SHAMA_RESEARCH_THEMES,
  dailySendLimit: 50,
  dailyFindTarget: 50,
  followupDays: 7,
  topics: [
    'antimicrobial stewardship clinical pharmacy',
    'medication safety high-alert medications',
    'clinical pharmacist artificial intelligence hospital',
    'evidence-based pharmacy practice implementation',
    'carbapenem antimicrobial stewardship hospital',
    'calcium channel blockers beta blockers angina',
    'hospital pharmacy service optimization clinical pharmacist',
    'digital clinical decision support pharmacy practice',
  ],
  countries: [
    'United States of America',
    'Canada',
    'Australia',
    'New Zealand',
    'United Kingdom',
    'Ireland',
    'Germany',
    'France',
    'Netherlands',
    'Belgium',
    'Switzerland',
    'Austria',
    'Sweden',
    'Norway',
    'Denmark',
    'Finland',
    'Italy',
    'Spain',
    'Singapore',
    'Japan',
  ],
};

// ─── Global Target Regions & Countries ────────────────────────────────────────

export interface RegionTargetGroup {
  id: string;
  region: string;
  description: string;
  countries: string[];
}

export const GLOBAL_TARGET_REGIONS: RegionTargetGroup[] = [
  {
    id: 'north_america',
    region: 'North America',
    description: 'United States & Canada with top research funding & NIH/NSERC grants',
    countries: ['United States of America', 'Canada'],
  },
  {
    id: 'oceania',
    region: 'Oceania',
    description: 'Australia & New Zealand with RTP & university international scholarships',
    countries: ['Australia', 'New Zealand'],
  },
  {
    id: 'western_northern_europe',
    region: 'Europe — Western and Northern Europe',
    description: 'UK, Germany, France, Nordics, Benelux & Switzerland with funded PhD salaries',
    countries: [
      'United Kingdom',
      'Ireland',
      'Germany',
      'France',
      'Netherlands',
      'Belgium',
      'Switzerland',
      'Austria',
      'Sweden',
      'Norway',
      'Denmark',
      'Finland',
      'Iceland',
      'Luxembourg',
      'Liechtenstein',
    ],
  },
  {
    id: 'southern_europe',
    region: 'Europe — Southern Europe',
    description: 'Italy, Spain, Portugal, Greece & Mediterranean research councils',
    countries: [
      'Italy',
      'Spain',
      'Portugal',
      'Greece',
      'Malta',
      'Cyprus',
      'Slovenia',
      'Croatia',
      'Andorra',
      'San Marino',
      'Monaco',
      'Vatican City',
    ],
  },
  {
    id: 'central_eastern_europe',
    region: 'Europe — Central and Eastern Europe',
    description: 'Poland, Czechia, Hungary, Baltics & Balkans with EU Horizon & national doctoral stipends',
    countries: [
      'Poland',
      'Czechia',
      'Slovakia',
      'Hungary',
      'Romania',
      'Bulgaria',
      'Estonia',
      'Latvia',
      'Lithuania',
      'Serbia',
      'Montenegro',
      'Albania',
      'Bosnia and Herzegovina',
      'North Macedonia',
      'Moldova',
      'Ukraine',
      'Belarus',
      'Russian Federation',
    ],
  },
  {
    id: 'euro_asian_boundary',
    region: 'European–Asian Boundary & Wider European Area',
    description: 'Türkiye, Caucasus & Central Asia participating in European research frameworks',
    countries: [
      'Türkiye',
      'Georgia',
      'Armenia',
      'Azerbaijan',
      'Kazakhstan',
    ],
  },
  {
    id: 'global_expansion',
    region: 'Additional Countries for Optional Global Expansion',
    description: 'East Asia, Southeast Asia, Gulf States & South Africa with leading global PhD fellowships',
    countries: [
      'Japan',
      'South Korea',
      'Singapore',
      'China',
      'Hong Kong',
      'Taiwan',
      'Malaysia',
      'Thailand',
      'United Arab Emirates',
      'Saudi Arabia',
      'Qatar',
      'South Africa',
    ],
  },
];

export const ALL_GLOBAL_COUNTRIES: string[] = GLOBAL_TARGET_REGIONS.flatMap((r) => r.countries);

// ─── Funding Classification Labels & Colors ───────────────────────────────────

export const FUNDING_CLASSIFICATION_LABELS: Record<NonNullable<Professor['fundingClassification']>, string> = {
  fully_funded: '💎 Fully Funded PhD',
  partially_funded: '⚡ Partially Funded',
  unfunded: '⚠️ Unfunded / Self-Funded',
  unknown: '❓ Funding Unknown',
};

export const FUNDING_CLASSIFICATION_COLORS: Record<NonNullable<Professor['fundingClassification']>, string> = {
  fully_funded: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/10',
  partially_funded: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  unfunded: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
  unknown: 'bg-slate-500/20 text-slate-300 border border-slate-500/20',
};

export const STATUS_LABELS: Record<Professor['status'], string> = {
  new: 'New',
  draft: 'Draft Ready',
  needs_review: 'Needs Review',
  sent: 'Sent',
  followup_draft: 'Follow-up Draft',
  followup_sent: 'Follow-up Sent',
  replied: 'Replied',
  bounced: 'Bounced',
  email_not_found: 'Email Not Found',
  unfunded_candidate: 'No Funding Ad',
};

export const STATUS_COLORS: Record<Professor['status'], string> = {
  new: 'bg-slate-500/20 text-slate-300 border border-slate-500/30',
  draft: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  needs_review: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  sent: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  followup_draft: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  followup_sent: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
  replied: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',
  bounced: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
  email_not_found: 'bg-slate-500/20 text-slate-400 border border-slate-500/20',
  unfunded_candidate: 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30',
};

export const VERIFICATION_LABELS: Record<Professor['verificationLevel'], string> = {
  verified: 'Verified Official',
  partial: 'Partial Evidence',
  unverified: 'Unverified / No Email',
};

export const VERIFICATION_COLORS: Record<Professor['verificationLevel'], string> = {
  verified: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  partial: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  unverified: 'bg-slate-500/20 text-slate-400 border border-slate-500/20',
};

// ─── Research Match & Relevance Score Helper ───────────────────────────────────

export function calculateProfessorMatchScore(prof: Partial<Professor>): number {
  if (typeof prof.relevanceScore === 'number' && prof.relevanceScore > 0) {
    return Math.min(100, Math.max(60, Math.round(prof.relevanceScore)));
  }

  const text = `${prof.matchReason || ''} ${prof.researchArea || ''} ${prof.recentPaper || ''} ${prof.evidenceSnippet || ''}`.toLowerCase();
  let score = 75;

  // Antimicrobial Stewardship / Carbapenems (Ali et al., 2022)
  if (text.includes('antimicrobial') || text.includes('stewardship') || text.includes('carbapenem') || text.includes('resistance') || text.includes('amr')) {
    score = Math.max(score, 96);
  }
  // High-alert medications & patient safety (Baig et al., 2025)
  if (text.includes('high-alert') || text.includes('medication safety') || text.includes('adverse drug') || text.includes('naranjo')) {
    score = Math.max(score, 94);
  }
  // AI & Digital Decision Support in Pharmacy (Baig et al., 2025)
  if (text.includes('artificial intelligence') || text.includes('clinical decision support') || text.includes('ai meets') || text.includes('machine learning')) {
    score = Math.max(score, 93);
  }
  // Cardiovascular Pharmacotherapy (CCBs vs Beta Blockers) (Abidi et al., 2024)
  if (text.includes('calcium channel') || text.includes('beta blocker') || text.includes('angina') || text.includes('cardiovascular')) {
    score = Math.max(score, 91);
  }
  // Evidence-based pharmacy practice & Implementation Science (Abidi, 2026)
  if (text.includes('evidence-based') || text.includes('evidence based') || text.includes('implementation') || text.includes('pharmacy practice')) {
    score = Math.max(score, 89);
  }
  // Clinical / Hospital Pharmacy
  if (text.includes('clinical pharmacy') || text.includes('hospital pharmacy') || text.includes('icu') || text.includes('patient safety')) {
    score = Math.max(score, 87);
  }

  return score;
}

// ─── Funding Timeline & Deadline Helper ────────────────────────────────────────

export interface FundingTimelineInfo {
  status: 'closing_soon' | 'active' | 'expired' | 'rolling' | 'not_stated';
  formattedDeadline: string;
  daysRemaining: number | null;
  badgeText: string;
  badgeClass: string;
  bannerTitle: string;
  bannerDescription: string;
  isExpired: boolean;
  canApply: boolean;
}

export function getFundingTimeline(
  deadline?: string | null,
  deadlineDate?: string | null
): FundingTimelineInfo {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // If rolling
  if (deadline && deadline.toLowerCase().includes('rolling')) {
    return {
      status: 'rolling',
      formattedDeadline: 'Rolling Admissions',
      daysRemaining: null,
      badgeText: '🔄 Rolling Funding Deadline',
      badgeClass: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
      bannerTitle: '🔄 Rolling Funding (Open until positions filled)',
      bannerDescription: 'Funding is allocated on a rolling basis. Positions can close at any time as soon as a suitable candidate is accepted — early application is strongly advised.',
      isExpired: false,
      canApply: true,
    };
  }

  // Parse ISO date if available
  let targetDate: Date | null = null;
  if (deadlineDate && /^\d{4}-\d{2}-\d{2}$/.test(deadlineDate)) {
    targetDate = new Date(`${deadlineDate}T00:00:00`);
  } else if (deadline && deadline !== 'not_stated') {
    // Attempt parse
    const parsed = new Date(deadline);
    if (!isNaN(parsed.getTime())) {
      targetDate = parsed;
    }
  }

  if (targetDate && !isNaN(targetDate.getTime())) {
    const diffMs = targetDate.getTime() - today.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const formatted = targetDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    if (daysRemaining < 0) {
      return {
        status: 'expired',
        formattedDeadline: formatted,
        daysRemaining,
        badgeText: `❌ Funding Expired (${formatted})`,
        badgeClass: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
        bannerTitle: `❌ Funding Closed on ${formatted}`,
        bannerDescription: `Funding for this position has officially expired (${formatted}). Under funder guidelines, applications cannot be submitted after this deadline.`,
        isExpired: true,
        canApply: false,
      };
    }

    if (daysRemaining <= 14) {
      return {
        status: 'closing_soon',
        formattedDeadline: formatted,
        daysRemaining,
        badgeText: `🔥 Funding Ends in ${daysRemaining}d (${formatted})`,
        badgeClass: 'bg-red-500/25 text-red-300 border border-red-500/50 animate-pulse font-bold',
        bannerTitle: `⚠️ URGENT: Funding Closes in ${daysRemaining} Days (${formatted})`,
        bannerDescription: `Funding ends on ${formatted}. You CANNOT apply after this date. Submit your PhD inquiry immediately before the deadline passes.`,
        isExpired: false,
        canApply: true,
      };
    }

    if (daysRemaining <= 30) {
      return {
        status: 'closing_soon',
        formattedDeadline: formatted,
        daysRemaining,
        badgeText: `⏳ Closes in ${daysRemaining}d (${formatted})`,
        badgeClass: 'bg-amber-500/25 text-amber-300 border border-amber-500/40 font-semibold',
        bannerTitle: `⏳ Funding Deadline: ${formatted} (${daysRemaining} Days Left)`,
        bannerDescription: `Funding ends on ${formatted}. Applications will not be accepted once this date passes.`,
        isExpired: false,
        canApply: true,
      };
    }

    return {
      status: 'active',
      formattedDeadline: formatted,
      daysRemaining,
      badgeText: `📅 Deadline: ${formatted} (${daysRemaining}d left)`,
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium',
      bannerTitle: `📅 Funding Deadline: ${formatted} (${daysRemaining} Days Left)`,
      bannerDescription: `Funding is active until ${formatted}. Ensure inquiry and formal application are submitted before this date.`,
      isExpired: false,
      canApply: true,
    };
  }

  // Not stated or text only
  if (deadline && deadline !== 'not_stated') {
    return {
      status: 'active',
      formattedDeadline: deadline,
      daysRemaining: null,
      badgeText: `📅 Deadline: ${deadline}`,
      badgeClass: 'bg-slate-500/20 text-slate-300 border border-slate-500/30',
      bannerTitle: `📅 Funding Deadline: ${deadline}`,
      bannerDescription: `Check the original advertisement link for exact submission cutoff times.`,
      isExpired: false,
      canApply: true,
    };
  }

  return {
    status: 'not_stated',
    formattedDeadline: 'Closing date not stated',
    daysRemaining: null,
    badgeText: 'ℹ️ Active Funding (Check ad)',
    badgeClass: 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
    bannerTitle: 'ℹ️ Active Funded Position (Closing Date Not Explicitly Stated)',
    bannerDescription: 'This funded PhD opportunity does not state an explicit closing date in the advertisement snippet. We recommend applying as early as possible.',
    isExpired: false,
    canApply: true,
  };
}

