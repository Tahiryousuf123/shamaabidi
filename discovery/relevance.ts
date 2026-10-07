import { SHAMA_TOPIC_SEEDS, RELEVANCE_OVERLAP_THRESHOLD } from './config';
import { DiscoveryCandidate } from './types';
import { SHAMA_RESEARCH_PAPERS, SHAMA_RESEARCH_THEMES } from '@/lib/types';

// Stopwords and tokens
const STOPWORDS = new Set([
  'and', 'or', 'in', 'of', 'for', 'with', 'the', 'a', 'an', 'at', 'by', 'on', 'to', 'from',
  'is', 'are', 'was', 'were', 'study', 'evaluation', 'assessment', 'effect', 'using', 'trial',
]);

function extractKeywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}

const ALL_SHAMA_KEYWORDS = new Set<string>();
for (const seed of [...SHAMA_TOPIC_SEEDS, ...SHAMA_RESEARCH_THEMES]) {
  for (const kw of extractKeywords(seed)) {
    ALL_SHAMA_KEYWORDS.add(kw);
  }
}

export function computeKeywordOverlap(text: string): number {
  if (!text) return 0;
  const targetWords = extractKeywords(text);
  if (targetWords.size === 0) return 0;

  let matches = 0;
  for (const w of targetWords) {
    if (ALL_SHAMA_KEYWORDS.has(w)) {
      matches++;
    }
  }

  return matches / Math.min(targetWords.size, 10);
}

export function evaluateRelevance(candidate: DiscoveryCandidate): {
  passed: boolean;
  score: number;
  reason: string;
} {
  const roleText = `${candidate.evidence.grantTitle || ''} ${candidate.name}`.toLowerCase();

  // Skip pure students, postdocs, and commercial entities
  if (
    roleText.includes('phd student') ||
    roleText.includes('master student') ||
    roleText.includes('undergraduate') ||
    roleText.includes('postdoc') ||
    roleText.includes('postdoctoral fellow')
  ) {
    return {
      passed: false,
      score: 0.1,
      reason: 'Role indicates student or postdoctoral fellow rather than academic supervisor/PI',
    };
  }

  const combinedText = `${candidate.evidence.paperTitle || ''} ${candidate.evidence.grantTitle || ''} ${candidate.institution}`;
  const overlapScore = computeKeywordOverlap(combinedText);

  // Core thematic boost
  let finalScore = overlapScore;
  const lower = combinedText.toLowerCase();

  if (lower.includes('antimicrobial') || lower.includes('stewardship') || lower.includes('carbapenem')) {
    finalScore = Math.max(finalScore, 0.85);
  }
  if (lower.includes('medication safety') || lower.includes('high-alert') || lower.includes('adverse drug')) {
    finalScore = Math.max(finalScore, 0.80);
  }
  if (lower.includes('clinical pharmacist') || lower.includes('pharmacy practice')) {
    finalScore = Math.max(finalScore, 0.75);
  }
  if (lower.includes('angina') || lower.includes('beta blocker') || lower.includes('calcium channel')) {
    finalScore = Math.max(finalScore, 0.75);
  }
  if (lower.includes('artificial intelligence') && lower.includes('pharmacy')) {
    finalScore = Math.max(finalScore, 0.80);
  }

  const passed = finalScore >= RELEVANCE_OVERLAP_THRESHOLD;
  return {
    passed,
    score: Math.round(finalScore * 100) / 100,
    reason: passed
      ? `High relevance overlap (${Math.round(finalScore * 100)}%) with Shama's clinical research`
      : `Relevance overlap (${Math.round(finalScore * 100)}%) below threshold ${RELEVANCE_OVERLAP_THRESHOLD * 100}%`,
  };
}

export function computeCandidateMatchScore(
  baseScore: number,
  sourceCount: number,
  hasActiveGrant: boolean,
  hasPaperOverlap: boolean,
  hasLiveFundingAd = false
): number {
  let score = Math.max(65, Math.min(85, Math.round(baseScore * 100)));

  // 1. Active matching grant boost (largest boost)
  if (hasActiveGrant) {
    score += 15;
  }

  // 2. Multi-source confirmation boost (+5 per extra source)
  if (sourceCount > 1) {
    score += (sourceCount - 1) * 5;
  }

  // 3. Recent paper overlap with Shama's publications
  if (hasPaperOverlap) {
    score += 10;
  }

  // 4. Live PhD advert boost
  if (hasLiveFundingAd) {
    score += 10;
  }

  return Math.min(100, score);
}
