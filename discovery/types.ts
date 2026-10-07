export interface DiscoveryQuery {
  topic: string;
  dateFrom?: string; // YYYY or YYYY-MM-DD
  regions?: string[];
  limit?: number;
}

export interface DiscoveryEvidence {
  paperTitle?: string;
  doi?: string;
  year?: number;
  grantId?: string;
  grantTitle?: string;
  grantStatus?: 'active' | 'closed' | 'funded' | 'unknown';
  fundingBody?: string;
}

export interface DiscoveryCandidate {
  name: string;
  institution: string;
  country: string;
  orcid?: string | null;
  openalexId?: string | null;
  email?: string | null;
  emailSourceUrl?: string | null;
  sourceName: string;
  sourceUrl: string;
  evidence: DiscoveryEvidence;
}

export interface SourceConfig {
  enabled: boolean;
  maxCallsPerDay: number;
  delayMs: number;
}

export interface DiscoverySourceModule {
  name: string;
  config: SourceConfig;
  search: (query: DiscoveryQuery) => Promise<DiscoveryCandidate[]>;
}

export interface PerSourceRunStats {
  sourceName: string;
  queriesRun: number;
  rawCandidates: number;
  passedRelevance: number;
  passedVerification: number;
  saved: number;
  errors: string[];
}

export interface DailyRunLog {
  runId: string;
  date: string; // YYYY-MM-DD
  timestamp: any;
  topic: string;
  regions: string[];
  sourcesRun: string[];
  perSourceStats: Record<string, PerSourceRunStats>;
  totalRawCandidates: number;
  totalPassedRelevance: number;
  totalPassedVerification: number;
  totalSaved: number;
  totalSkippedDuplicates: number;
  rejectionLog: Array<{
    name: string;
    institution: string;
    source: string;
    reason: string;
  }>;
}

export interface MergedCandidate extends DiscoveryCandidate {
  sources: string[];
  sourceCount: number;
  discoveryConfidence: 'high' | 'medium' | 'low';
  fundingStatus: 'funded' | 'unknown';
  fundingSourceUrl?: string | null;
  fundingEvidence?: string | null;
  fundingBody?: string | null;
  matchScore: number;
  relevanceScore: number;
  roleTitle?: string | null;
  verifiedFacultyUrl?: string | null;
  recentPaperTitle?: string | null;
}
