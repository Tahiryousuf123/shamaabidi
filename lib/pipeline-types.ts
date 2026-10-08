export type CandidateStatus =
  | 'discovered'
  | 'email_found'
  | 'verified'
  | 'drafted'
  | 'no_email'
  | 'rejected'
  | 'bounced';

export type CandidateEmailSource =
  | 'europepmc-fulltext'
  | 'pubmed-affiliation'
  | 'orcid'
  | 'faculty-page';

export type CandidateEmailConfidence = 'institutional' | 'personal-name-match';

export interface CandidateRecentWork {
  title: string;
  year: number;
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
}

export interface Candidate {
  id?: string;
  name: string;
  openalexId: string;
  orcid: string | null;
  institution: string;
  institutionHomepage: string | null;
  country: string;
  topics: string[];
  recentWorkTitles: string[];
  recentWorks?: CandidateRecentWork[];
  relevanceScore: number;
  email: string | null;
  emailSource: CandidateEmailSource | null;
  emailConfidence: CandidateEmailConfidence | null;
  status: CandidateStatus;
  attempts: number;
  lastError: string | null;
  createdAt: any;
  updatedAt: any;
  draftedAt?: any;
}

export interface PipelineRunReport {
  timestamp: string;
  stage: string;
  dryRun: boolean;
  limit: number;
  discovered_new: number;
  email_attempted: number;
  email_found: number;
  email_found_by_source: Record<string, number>;
  no_email: number;
  verify_passed: number;
  verify_rejected: number;
  verify_rejected_by_reason: Record<string, number>;
  drafted: number;
  skipped_dup: number;
  failed: number;
  backlog_by_status: Record<CandidateStatus, number>;
  createdAt?: any;
}
