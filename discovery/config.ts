import { SourceConfig } from './types';

export const CONTACT_EMAIL = (process.env.CONTACT_EMAIL || 'shamaabidiphd@gmail.com').trim();
export const USER_AGENT = `PhDReach/2.0 (mailto:${CONTACT_EMAIL})`;

export const SHAMA_TOPIC_SEEDS = [
  'clinical pharmacist interventions',
  'antimicrobial stewardship',
  'carbapenem',
  'antimicrobial resistance ICU',
  'angina antianginal drugs beta blockers calcium channel blockers',
  'adverse drug reactions',
  'pharmacovigilance',
  'medication safety',
  'high-alert medications',
  'artificial intelligence ChatGPT large language model pharmacy',
  'pharmacy practice',
];

export const TARGET_REGIONS_CONFIG = {
  UK_IRELAND: ['United Kingdom', 'Ireland', 'GB', 'IE'],
  EUROPE: [
    'Germany', 'France', 'Netherlands', 'Belgium', 'Switzerland', 'Austria',
    'Sweden', 'Norway', 'Denmark', 'Finland', 'Italy', 'Spain', 'Portugal',
    'Poland', 'Czechia', 'Greece', 'DE', 'FR', 'NL', 'BE', 'CH', 'AT', 'SE',
    'NO', 'DK', 'FI', 'IT', 'ES', 'PT', 'PL', 'CZ', 'GR',
  ],
  OCEANIA: ['Australia', 'New Zealand', 'AU', 'NZ'],
  CANADA: ['Canada', 'CA'],
  MALAYSIA: ['Malaysia', 'MY'],
  GULF: ['United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Oman', 'AE', 'SA', 'QA'],
  USA: ['United States of America', 'United States', 'USA', 'US'],
};

export const ALL_TARGET_COUNTRIES = [
  ...TARGET_REGIONS_CONFIG.UK_IRELAND,
  ...TARGET_REGIONS_CONFIG.EUROPE,
  ...TARGET_REGIONS_CONFIG.OCEANIA,
  ...TARGET_REGIONS_CONFIG.CANADA,
  ...TARGET_REGIONS_CONFIG.MALAYSIA,
  ...TARGET_REGIONS_CONFIG.GULF,
];

export function isTargetRegion(countryOrAffiliation: string, includeUS = false): boolean {
  if (!countryOrAffiliation) return false;
  const lower = countryOrAffiliation.toLowerCase();
  const list = includeUS ? [...ALL_TARGET_COUNTRIES, ...TARGET_REGIONS_CONFIG.USA] : ALL_TARGET_COUNTRIES;
  return list.some((c) => lower.includes(c.toLowerCase()));
}

export const SOURCES_CONFIG: Record<string, SourceConfig> = {
  pubmed: {
    enabled: true,
    maxCallsPerDay: 50,
    delayMs: process.env.NCBI_API_KEY ? 120 : 350,
  },
  europepmc: {
    enabled: true,
    maxCallsPerDay: 50,
    delayMs: 250,
  },
  semanticscholar: {
    enabled: true,
    maxCallsPerDay: 50,
    delayMs: 1100, // Throttled to >= 1s
  },
  crossref: {
    enabled: true,
    maxCallsPerDay: 50,
    delayMs: 250,
  },
  orcid: {
    enabled: true,
    maxCallsPerDay: 50,
    delayMs: 300,
  },
  clinicaltrials: {
    enabled: true,
    maxCallsPerDay: 50,
    delayMs: 250,
  },
  ukri: {
    enabled: true,
    maxCallsPerDay: 50,
    delayMs: 300,
  },
  nihreporter: {
    enabled: true,
    maxCallsPerDay: 50,
    delayMs: 300,
  },
  cordis: {
    enabled: true,
    maxCallsPerDay: 50,
    delayMs: 300,
  },
};

export const RELEVANCE_OVERLAP_THRESHOLD = 0.35;

export function getDateWindow(fallbackYears = 3): { fromYear: number; fromDate: string; toYear: number; toDate: string } {
  const currentYear = new Date().getFullYear();
  const fromYear = currentYear - fallbackYears;
  return {
    fromYear,
    fromDate: `${fromYear}-01-01`,
    toYear: currentYear,
    toDate: `${currentYear}-12-31`,
  };
}
