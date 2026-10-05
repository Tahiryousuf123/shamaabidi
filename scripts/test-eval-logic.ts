import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

const SHAMA_PAPERS = [
  'Effectiveness and safety assessment of calcium channel blockers compared to beta blockers in patients with angina (Abidi et al., 2024)',
  'Evaluation of carbapenem antimicrobial stewardship program at a tertiary care hospital (Ali et al., 2022)',
  'AI meets human expertise: Comparison between clinical pharmacist interventions and artificial intelligence at a tertiary care hospital (Baig et al., 2025)',
  'Evaluating knowledge of high-alert medications among nurses, pharmacists, and clinicians to improve medication safety (Baig et al., 2025)',
  'Exploring the landscape of evidence based pharmacy practice: knowledge, attitudes and implementation barriers (Abidi, 2026)',
];

const SHAMA_THEMES = [
  'clinical pharmacy',
  'pharmacy practice',
  'medication safety',
  'antimicrobial stewardship and resistance',
  'implementation science',
  'health services research',
  'digital health / clinical decision support',
  'high-alert medications',
];

interface ExtractedAd {
  title: string;
  adUrl: string;
  supervisorName: string;
  university: string;
  fundingType: string;
  fundingAmount: string;
  isFunded: boolean;
  isSelfFunded: boolean;
  eligibility: string;
  internationalAllowed: boolean;
  deadline: string;
  deadlineDate: string | null;
  contactEmail: string | null;
  rawText: string;
}

interface EvaluationResult {
  accepted: boolean;
  rejectionReason?: string;
  relevanceScore: number;
  matchReason: string;
  matchedPaper?: string;
  matchedTheme?: string;
}

export function evaluateAd(ad: ExtractedAd): EvaluationResult {
  const text = `${ad.title} ${ad.rawText}`.toLowerCase();

  // 1. Funding check: Must be explicitly funded and NOT self-funded
  if (ad.isSelfFunded || text.includes('self-funded phd students only') || text.includes('self-funded only') || text.includes('this is a self-funded phd')) {
    return {
      accepted: false,
      rejectionReason: 'Rejected: Ad is self-funded only (no institutional/grant funding provided)',
      relevanceScore: 0,
      matchReason: 'N/A',
    };
  }

  const hasFundingKeyword =
    ad.isFunded ||
    text.includes('fully funded') ||
    text.includes('fully-funded') ||
    text.includes('phd studentship') ||
    text.includes('studentship funded by') ||
    text.includes('funded phd') ||
    text.includes('scholarship') ||
    text.includes('stipend') ||
    text.includes('tuition fees and maintenance');

  if (!hasFundingKeyword) {
    return {
      accepted: false,
      rejectionReason: 'Rejected: No explicit funding stated (fully funded / studentship / scholarship / stipend missing)',
      relevanceScore: 0,
      matchReason: 'N/A',
    };
  }

  // 2. Eligibility check: International students must NOT be excluded
  if (!ad.internationalAllowed || text.includes('uk students only') || text.includes('home students only') || text.includes('not open to international students') || text.includes('uk fee status only')) {
    return {
      accepted: false,
      rejectionReason: 'Rejected: Restricted to Home/UK applicants only; international students excluded',
      relevanceScore: 0,
      matchReason: 'N/A',
    };
  }

  // 3. Relevance scoring against Shama's themes & 5 papers (0 - 100)
  let score = 0;
  let matchedPaper = '';
  let matchedTheme = '';

  // Theme scoring
  const amrMatches = text.includes('antimicrobial') || text.includes('antibiotic') || text.includes('resistance') || text.includes('stewardship') || text.includes('bacterial') || text.includes('infection');
  const medSafetyMatches = text.includes('medication safety') || text.includes('pharmacovigilance') || text.includes('adverse drug') || text.includes('high-alert') || text.includes('prescribing error');
  const clinPharmMatches = text.includes('clinical pharmacy') || text.includes('pharmacy practice') || text.includes('pharmacist') || text.includes('hospital pharmacy') || text.includes('clinical pharmacist');
  const aiHealthMatches = text.includes('artificial intelligence') || text.includes('clinical decision support') || text.includes('digital health') || text.includes('machine learning in healthcare');
  const implSciMatches = text.includes('implementation science') || text.includes('health services research') || text.includes('evidence-based practice') || text.includes('healthcare quality');
  const cardioMatches = text.includes('angina') || text.includes('calcium channel') || text.includes('beta blocker') || text.includes('cardiovascular pharmacotherapy');

  if (amrMatches) {
    score += 45;
    matchedTheme = 'antimicrobial stewardship and resistance';
    matchedPaper = SHAMA_PAPERS[1];
  }
  if (medSafetyMatches) {
    score += 45;
    matchedTheme = 'medication safety & pharmacovigilance';
    matchedPaper = SHAMA_PAPERS[3];
  }
  if (clinPharmMatches) {
    score += 35;
    if (!matchedTheme) {
      matchedTheme = 'clinical pharmacy and pharmacy practice';
      matchedPaper = SHAMA_PAPERS[4];
    }
  }
  if (aiHealthMatches) {
    score += 35;
    if (!matchedTheme) {
      matchedTheme = 'AI/digital clinical decision support';
      matchedPaper = SHAMA_PAPERS[2];
    }
  }
  if (implSciMatches) {
    score += 30;
    if (!matchedTheme) {
      matchedTheme = 'implementation science & health services';
      matchedPaper = SHAMA_PAPERS[4];
    }
  }
  if (cardioMatches) {
    score += 40;
    if (!matchedTheme) {
      matchedTheme = 'cardiovascular clinical pharmacotherapy';
      matchedPaper = SHAMA_PAPERS[0];
    }
  }

  // Bonus points for clinical application / hospital relevance
  if (text.includes('hospital') || text.includes('patient') || text.includes('clinical trial') || text.includes('intervention')) {
    score += 15;
  }

  // Cap at 100
  score = Math.min(100, score);

  if (score < 60) {
    return {
      accepted: false,
      rejectionReason: `Rejected: Relevance score ${score}/100 is below the required 60 threshold (lacks direct clinical pharmacy/AMR/medication safety focus)`,
      relevanceScore: score,
      matchReason: 'N/A',
    };
  }

  // 4. Generate one-sentence matchReason comparing project to Shama's papers
  let matchReason = '';
  if (matchedPaper.includes('carbapenem')) {
    matchReason = `Directly connects with your published prospective interventional trial evaluating carbapenem antimicrobial stewardship at a tertiary care hospital (Ali et al., 2022).`;
  } else if (matchedPaper.includes('high-alert')) {
    matchReason = `Directly aligns with your published multi-professional research evaluating high-alert medication knowledge to prevent adverse events in hospital settings (Baig et al., 2025).`;
  } else if (matchedPaper.includes('artificial intelligence')) {
    matchReason = `Directly builds upon your published hospital study comparing clinical pharmacist interventions with artificial intelligence decision support (Baig et al., 2025).`;
  } else if (matchedPaper.includes('calcium channel')) {
    matchReason = `Directly matches your published observational study comparing calcium channel blockers to beta blockers in angina patients (Abidi et al., 2024).`;
  } else {
    matchReason = `Strongly aligns with your MPhil research and FIP Montreal presentation on evidence-based pharmacy practice and health services implementation (Abidi, 2024 & 2026).`;
  }

  return {
    accepted: true,
    relevanceScore: score,
    matchReason,
    matchedPaper,
    matchedTheme,
  };
}

console.log('Evaluation logic compiled successfully');
