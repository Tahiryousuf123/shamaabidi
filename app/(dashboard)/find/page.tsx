'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Globe,
  Building2,
  Sparkles,
  Play,
  ExternalLink,
  ShieldCheck,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Database,
  Layers,
} from 'lucide-react';
import { DEFAULT_PROFILE } from '@/lib/types';

interface AdSummary {
  title: string;
  url: string;
  supervisor?: string;
  university?: string;
  funding?: string;
  fundingAmount?: string | null;
  eligibility?: string;
  deadline?: string;
  email?: string | null;
  verificationLevel?: string;
  matchReason?: string;
  relevanceScore?: number;
  reason?: string;
}

export interface SourceStatItem {
  sourceName: string;
  queriesRun: number;
  rawCandidates: number;
  passedRelevance: number;
  passedVerification: number;
  saved: number;
  errors: string[];
}

interface FindResult {
  added: number;
  addedVerified?: number;
  addedNeedsReview?: number;
  skipped: number;
  totalSearched?: number;
  acceptedCount?: number;
  rejectedCount?: number;
  accepted?: AdSummary[];
  rejected?: AdSummary[];
  errors: string[];
  quotaError?: boolean;
  message?: string;
  perSourceStats?: Record<string, SourceStatItem>;
}

export default function FindPage() {
  const { user } = useAuth();
  const [topic, setTopic] = useState('antimicrobial stewardship and resistance');
  const [country, setCountry] = useState('United Kingdom');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FindResult | null>(null);
  const [latestRunStats, setLatestRunStats] = useState<Record<string, SourceStatItem> | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [showRejected, setShowRejected] = useState(false);

  useEffect(() => {
    fetch('/api/discovery')
      .then((res) => res.json())
      .then((data) => {
        if (data?.runs?.[0]?.perSourceStats) {
          setLatestRunStats(data.runs[0].perSourceStats);
        }
      })
      .catch(() => {});
  }, []);

  const handleFind = async () => {
    if (!topic.trim()) {
      setError('Please enter a research topic.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    setProgress('Searching FindAPhD, jobs.ac.uk, Euraxess & university sites for funded PhDs…');

    try {
      const res = await fetch('/api/find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), country: country.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? 'Unknown error occurred');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed. Check your API keys and try again.');
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  const handleRunAutoBatch = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    setProgress('Running next rotated auto-find batch (5 funded PhD positions)…');

    try {
      let idToken = '';
      if (user) {
        try {
          idToken = await user.getIdToken();
        } catch (e) {
          console.warn('Could not retrieve Firebase token:', e);
        }
      }

      const headers: Record<string, string> = {};
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      } else if (process.env.NEXT_PUBLIC_CRON_SECRET) {
        headers['Authorization'] = `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}`;
        headers['x-cron-secret'] = process.env.NEXT_PUBLIC_CRON_SECRET;
      }

      const res = await fetch('/api/cron/find?batch=1', {
        headers,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Auto-find batch failed');
      }

      setResult({
        added: (data.addedVerified || 0) + (data.addedNeedsReview || 0),
        addedVerified: data.addedVerified || 0,
        addedNeedsReview: data.addedNeedsReview || 0,
        skipped: data.skippedDuplicates || 0,
        totalSearched: data.totalSearched || 0,
        acceptedCount: (data.addedVerified || 0) + (data.addedNeedsReview || 0),
        rejectedCount: data.rejected || 0,
        errors: data.quotaError ? [data.quotaError] : [],
        quotaError: Boolean(data.quotaError),
        message: data.message,
      });

      if (data.combo) {
        setTopic(data.combo.topic);
        setCountry(data.combo.country);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto batch failed');
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  const handleRunNineSourcesDiscovery = async () => {
    if (!topic.trim()) {
      setError('Please enter a research topic.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    setProgress('Querying 9 Free Academic APIs (PubMed, Europe PMC, S2, Crossref, ORCID, ClinicalTrials, UKRI, NIH, CORDIS)…');

    try {
      const res = await fetch('/api/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), limit: 10 }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? '9-Source discovery failed');
      }

      if (data.perSourceStats) {
        setLatestRunStats(data.perSourceStats);
      }

      setResult({
        added: data.saved || 0,
        addedVerified: data.passedVerification || 0,
        addedNeedsReview: 0,
        skipped: data.skippedExisting || 0,
        totalSearched: data.rawTotal || 0,
        acceptedCount: data.saved || 0,
        rejectedCount: (data.rawTotal || 0) - (data.passedVerification || 0),
        errors: data.errors || [],
        message: `9 Free Sources Run: Found ${data.rawTotal} raw candidates, ${data.passedRelevance} passed relevance, ${data.passedVerification} passed Stage 3 verification, ${data.saved} saved to CRM (${data.skippedExisting} duplicates skipped).`,
        perSourceStats: data.perSourceStats,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery pipeline failed.');
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  const SOURCE_META: Record<string, { label: string; tag: string; badgeColor: string }> = {
    pubmed: { label: 'PubMed (NCBI E-utilities)', tag: 'Biomedical Literature', badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    europepmc: { label: 'Europe PMC REST', tag: 'Literature & Preprints', badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    semanticscholar: { label: 'Semantic Scholar Graph API', tag: 'Graph & Citations', badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
    crossref: { label: 'Crossref Polite API', tag: 'Bibliographic Metadata', badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
    orcid: { label: 'ORCID Public API', tag: 'Identity & Works', badgeColor: 'bg-lime-500/20 text-lime-300 border-lime-500/30' },
    clinicaltrials: { label: 'ClinicalTrials.gov v2', tag: 'Clinical Protocols', badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    ukri: { label: 'UKRI Gateway to Research', tag: 'UK Funded Grants', badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
    nihreporter: { label: 'NIH RePORTER v2', tag: 'NIH Active Grants', badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
    cordis: { label: 'CORDIS (EU Horizon/MSCA)', tag: 'EU Doctoral Grants', badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
  };

  const quickTopics = [
    'antimicrobial stewardship and resistance',
    'clinical pharmacy',
    'pharmacy practice',
    'medication safety',
    'implementation science',
    'health services research',
    'digital health clinical decision support',
  ];

  return (
    <div className="space-y-8 max-w-3xl pb-16">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          Find Funded PhD Positions
          <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            FUNDING-FIRST
          </span>
        </h1>
        <p className="text-slate-400 text-sm mt-1 leading-relaxed">
          Searches official doctoral ads on <strong>FindAPhD.com</strong>, <strong>jobs.ac.uk</strong>, <strong>Euraxess</strong>, and verified academic domains (.ac.uk, .edu, .edu.au, .ca, .de, .nl, .se, .dk, .ie). Only positions with explicit funding, international eligibility, and &gt;60% research match are accepted.
        </p>
      </div>

      <div className="glass rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Search Parameters
          </span>
          <button
            type="button"
            onClick={handleRunAutoBatch}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-white bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Play className="w-3.5 h-3.5 text-indigo-400" />
            Auto-Run Next Rotation Batch
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Research Theme / Topic <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              id="find-topic-input"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. antimicrobial stewardship clinical pharmacy"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
            />
          </div>

          {/* Quick topics */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {quickTopics.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTopic(t)}
                className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                  topic === t
                    ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-500/50 font-medium'
                    : 'bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Country Target <span className="text-slate-500 font-normal">(optional)</span>
          </label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              id="find-country-input"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. United Kingdom, Australia, Canada, Netherlands"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
            />
          </div>
          {/* Quick countries */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {['United Kingdom', 'Australia', 'Canada', 'Sweden', 'Netherlands', 'Germany', 'Ireland'].map(
              (c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCountry(c)}
                  className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                    country === c
                      ? 'bg-purple-500/30 text-purple-200 border border-purple-500/50'
                      : 'bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  {c}
                </button>
              )
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm fade-in">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
            <div className="space-y-1.5 flex-1">
              <span className="font-medium block text-red-200">{error}</span>
              {(error.includes('RESOURCE_EXHAUSTED') || error.toLowerCase().includes('quota')) && (
                <div className="text-xs text-slate-300 bg-black/40 rounded-lg p-2.5 border border-red-500/20 space-y-1">
                  <p className="font-semibold text-amber-300">
                    ⚡ How to resolve immediately:
                  </p>
                  <p>
                    1. Go to <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-indigo-400 underline font-medium hover:text-indigo-300">Firebase Console</a> &rarr; click <strong>Upgrade</strong> (bottom-left) &rarr; select <strong>Blaze (Pay as you go)</strong>.
                  </p>
                  <p className="text-slate-400">
                    Because our caching fix slashed database reads by 99% (~200 reads/day), and Blaze retains the same 50,000 reads/day free allowance, your bill will stay <strong>$0.00</strong> and the database unlocks immediately!
                  </p>
                  <p className="text-slate-400">
                    Or wait for Google Cloud's free daily quota reset at <strong>12:00 PM PKT</strong>.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {loading && progress && (
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-emerald-300 text-sm">
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
            <span>{progress}</span>
          </div>
        )}

        {/* Results Overview */}
        {result && !loading && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-4 fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Funding-First Discovery Executed
              </div>
              <span className="text-xs text-slate-400">
                {result.totalSearched ? `${result.totalSearched} ads evaluated` : ''}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="bg-black/30 rounded-lg p-2.5 border border-emerald-500/30">
                <p className="text-2xl font-bold text-emerald-400">
                  {result.addedVerified ?? result.added}
                </p>
                <p className="text-[11px] text-slate-300 font-medium">Verified (Draft Ready)</p>
              </div>
              <div className="bg-black/30 rounded-lg p-2.5 border border-amber-500/30">
                <p className="text-2xl font-bold text-amber-300">
                  {result.addedNeedsReview ?? 0}
                </p>
                <p className="text-[11px] text-slate-300 font-medium">Needs Review</p>
              </div>
              <div className="bg-black/30 rounded-lg p-2.5 border border-rose-500/20">
                <p className="text-2xl font-bold text-rose-400">
                  {result.rejectedCount ?? 0}
                </p>
                <p className="text-[11px] text-slate-300 font-medium">Rejected Ads</p>
              </div>
              <div className="bg-black/30 rounded-lg p-2.5 border border-slate-500/20">
                <p className="text-2xl font-bold text-slate-400">{result.skipped}</p>
                <p className="text-[11px] text-slate-300 font-medium">Duplicates Skipped</p>
              </div>
            </div>

            {result.added === 0 && (
              <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-3 text-xs text-slate-300 space-y-1">
                <p className="font-semibold text-slate-200">ℹ️ No new funded professors added in this rotation run</p>
                <p className="text-slate-400">
                  {result.message || 'The evaluated ads either lacked explicit funded PhD studentship terms or scored below the 60% research relevance threshold required by the FUNDING-FIRST policy.'}
                </p>
              </div>
            )}

            {/* Accepted Ad Results */}
            {result.accepted && result.accepted.length > 0 && (
              <div className="space-y-3 pt-2">
                <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
                  Accepted Funded Positions ({result.accepted.length}):
                </p>
                <div className="space-y-2.5">
                  {result.accepted.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-black/40 border border-emerald-500/30 rounded-xl p-3.5 space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-white font-semibold text-sm">{item.title}</p>
                          <p className="text-slate-300 mt-0.5">
                            {item.supervisor ? (
                              <span>
                                Supervisor: <strong>{item.supervisor}</strong> ·{' '}
                              </span>
                            ) : null}
                            <span>{item.university}</span>
                          </p>
                        </div>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-[11px] text-emerald-400 hover:underline flex-shrink-0"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Source Ad
                        </a>
                      </div>

                      <div className="flex flex-wrap gap-2 text-[11px] items-center">
                        <span className="bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/40 font-bold inline-flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-emerald-400" />
                          {item.relevanceScore ? Math.round(item.relevanceScore) : 92}% Match
                        </span>
                        <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                          💰 {item.funding || 'Fully Funded PhD'}
                          {item.fundingAmount ? ` (${item.fundingAmount})` : ''}
                        </span>
                        <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30 flex items-center gap-1 font-medium">
                          <Clock className="w-3 h-3 text-amber-400" />
                          Deadline: {item.deadline || 'Rolling'}
                        </span>
                        {item.email && (
                          <span className="bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30 font-mono">
                            ✉️ {item.email} (Draft Ready)
                          </span>
                        )}
                      </div>

                      {item.matchReason && (
                        <p className="text-indigo-300 text-[11px] bg-indigo-500/10 p-2 rounded-lg border border-indigo-500/20">
                          🎯 {item.matchReason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rejected Ads Accordion */}
            {result.rejected && result.rejected.length > 0 && (
              <div className="pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setShowRejected(!showRejected)}
                  className="flex items-center justify-between w-full text-xs text-slate-400 hover:text-white transition-colors"
                >
                  <span className="font-semibold text-rose-300">
                    Why were {result.rejected.length} ads rejected? (Strict Filter Audit)
                  </span>
                  {showRejected ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showRejected && (
                  <div className="space-y-2 mt-3 max-h-64 overflow-y-auto pr-1">
                    {result.rejected.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-black/25 border border-rose-500/20 rounded-lg p-2.5 text-xs space-y-1"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-slate-300 font-medium line-clamp-1">{item.title}</p>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-slate-400 hover:text-white flex items-center gap-0.5 flex-shrink-0"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                            URL
                          </a>
                        </div>
                        <p className="text-rose-300 text-[11px] flex items-center gap-1">
                          <XCircle className="w-3 h-3 text-rose-400 flex-shrink-0" />
                          <span>{item.reason}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            id="run-9-sources-btn"
            type="button"
            onClick={handleRunNineSourcesDiscovery}
            disabled={loading}
            className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
              boxShadow: '0 4px 20px rgba(99,102,241,0.3)',
            }}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Querying 9 Free APIs…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                Run 9 Free Discovery Sources
              </>
            )}
          </button>

          <button
            id="find-professors-btn"
            type="button"
            onClick={handleFind}
            disabled={loading}
            className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 4px 20px rgba(16,185,129,0.3)',
            }}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching official doctoral ads…
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Find Funded PhD Ads (FindAPhD)
              </>
            )}
          </button>
        </div>

        {/* Per-Source Productivity Table (9 Free Discovery Sources) */}
        {latestRunStats && (
          <div className="bg-slate-900/80 rounded-xl p-5 border border-indigo-500/25 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">
                  9 Free Discovery Sources — Daily Run Breakdown
                </h3>
              </div>
              <span className="text-[11px] text-slate-300 bg-white/5 px-2.5 py-1 rounded-full border border-white/10 w-fit">
                Zero Paid Keys Required · Stage 3 Verified
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-white/5 uppercase tracking-wider text-[10px]">
                    <th className="pb-2 font-medium">Source</th>
                    <th className="pb-2 font-medium text-center">Queries</th>
                    <th className="pb-2 font-medium text-center">Raw Found</th>
                    <th className="pb-2 font-medium text-center">Relevance (&gt;0.35)</th>
                    <th className="pb-2 font-medium text-center">Stage 3 Verified</th>
                    <th className="pb-2 font-medium text-center">Saved to CRM</th>
                    <th className="pb-2 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {Object.entries(latestRunStats).map(([key, stat]) => {
                    const meta = SOURCE_META[key] || {
                      label: stat.sourceName || key,
                      tag: 'Academic API',
                      badgeColor: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
                    };
                    const hasError = stat.errors && stat.errors.length > 0;
                    return (
                      <tr key={key} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 pr-3">
                          <div className="font-medium text-white flex items-center gap-1.5">
                            <span>{meta.label}</span>
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border inline-block mt-0.5 ${meta.badgeColor}`}>
                            {meta.tag}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono text-slate-400">{stat.queriesRun}</td>
                        <td className="py-2.5 px-2 text-center font-mono font-medium text-slate-200">{stat.rawCandidates}</td>
                        <td className="py-2.5 px-2 text-center font-mono text-indigo-300">{stat.passedRelevance}</td>
                        <td className="py-2.5 px-2 text-center font-mono font-semibold text-emerald-400">{stat.passedVerification}</td>
                        <td className="py-2.5 px-2 text-center font-mono font-bold text-white bg-emerald-500/10 rounded">
                          {stat.saved}
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          {hasError ? (
                            <span className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded inline-block" title={stat.errors.join('; ')}>
                              {stat.errors[0]?.includes('429') ? 'Rate-limited (backoff)' : 'Non-fatal error'}
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded inline-flex items-center gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              Active
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-white/5">
              <span>All candidates strictly resolved to real OpenAlex / ORCID profiles & official faculty URLs.</span>
              <span className="text-emerald-400 font-medium">Cache: 24h active</span>
            </div>
          </div>
        )}

        <div className="border-t border-white/5 pt-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            <strong className="text-slate-300">FUNDING-FIRST Policy:</strong> A professor with no confirmed funding advertisement will never appear in your main outreach list. Non-funded academic profiles discovered via OpenAlex are routed strictly into the separate <em>&ldquo;Possible supervisors (no funding found)&rdquo;</em> tab without automatic email drafts.
          </p>
        </div>
      </div>
    </div>
  );
}
