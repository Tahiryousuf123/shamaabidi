'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
  Professor,
  STATUS_LABELS,
  STATUS_COLORS,
  VERIFICATION_LABELS,
  VERIFICATION_COLORS,
  FUNDING_CLASSIFICATION_LABELS,
  FUNDING_CLASSIFICATION_COLORS,
  calculateProfessorMatchScore,
  getFundingTimeline,
} from '@/lib/types';
import {
  Users,
  Search,
  ChevronRight,
  Loader2,
  ExternalLink,
  Plus,
  Mail,
  Building2,
  Globe,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

type MainViewTab = 'funded' | 'unfunded';

function renderDeadlineBadge(deadline: string | undefined, deadlineDate?: string | null) {
  const info = getFundingTimeline(deadline, deadlineDate);

  return (
    <div className="space-y-1">
      <span className={`text-xs px-2.5 py-1 rounded-md inline-flex items-center gap-1.5 ${info.badgeClass}`}>
        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
        <span>{info.badgeText}</span>
      </span>
      {info.status === 'closing_soon' && (
        <p className="text-[11px] text-amber-300 font-medium leading-tight">
          ⚠️ Apply before this date — funding closes after
        </p>
      )}
      {info.isExpired && (
        <p className="text-[11px] text-rose-300 font-medium leading-tight">
          ⛔ Deadline passed — cannot apply anymore
        </p>
      )}
      {info.status === 'rolling' && (
        <p className="text-[11px] text-blue-300/80 leading-tight">
          Apply early before funded seats fill
        </p>
      )}
    </div>
  );
}

export default function ProfessorsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MainViewTab>('funded');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCountry, setFilterCountry] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'deadline' | 'recent'>('deadline');
  const [hideExpired, setHideExpired] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'professors'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => {
        const raw = doc.data();
        return {
          id: doc.id,
          ...raw,
          createdAt: raw.createdAt?.toDate ? raw.createdAt.toDate() : new Date(),
          sentAt: raw.sentAt?.toDate ? raw.sentAt.toDate() : null,
        };
      }) as Professor[];
      setProfessors(data);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const todayIso = new Date().toISOString().slice(0, 10);

  // Partition professors strictly:
  // Main funded list = hasFundingAd === true OR fundingAvailable === 'yes'
  // Unfunded / OpenAlex only = hasFundingAd === false AND fundingAvailable !== 'yes'
  const fundedProfessors = professors.filter(
    (p) => p.hasFundingAd === true || (p.fundingAvailable === 'yes' && p.status !== 'unfunded_candidate')
  );

  const unfundedProfessors = professors.filter(
    (p) => !(p.hasFundingAd === true || (p.fundingAvailable === 'yes' && p.status !== 'unfunded_candidate'))
  );

  const currentDataset = activeTab === 'funded' ? fundedProfessors : unfundedProfessors;

  const countries = Array.from(new Set(currentDataset.map((p) => p.country).filter(Boolean))).sort();

  const filtered = currentDataset.filter((p) => {
    if (activeTab === 'funded') {
      if (filterStatus === 'draft' && p.status !== 'draft') return false;
      if (filterStatus === 'needs_review' && p.status !== 'needs_review') return false;
      if (filterStatus === 'sent' && p.status !== 'sent' && p.status !== 'followup_sent') return false;
      if (filterStatus === 'replied' && p.status !== 'replied') return false;
      if (filterStatus === 'email_not_found' && p.status !== 'email_not_found') return false;

      // Hide expired ads if active
      if (hideExpired && p.deadlineDate && p.deadlineDate < todayIso) {
        return false;
      }
    }

    if (filterCountry !== 'all' && p.country !== filterCountry) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.university.toLowerCase().includes(q) ||
        p.researchArea?.toLowerCase().includes(q) ||
        p.matchReason?.toLowerCase().includes(q) ||
        p.recentPaper?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Sorting
  filtered.sort((a, b) => {
    if (activeTab === 'funded' && sortBy === 'deadline') {
      // Upcoming valid dates first, then rolling, then not stated, then expired
      const aExpired = Boolean(a.deadlineDate && a.deadlineDate < todayIso);
      const bExpired = Boolean(b.deadlineDate && b.deadlineDate < todayIso);
      if (aExpired !== bExpired) return aExpired ? 1 : -1;

      const aKey = a.deadlineDate || (a.deadline?.toLowerCase().includes('rolling') ? '9998' : '9999');
      const bKey = b.deadlineDate || (b.deadline?.toLowerCase().includes('rolling') ? '9998' : '9999');
      return aKey.localeCompare(bKey);
    }
    const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
    const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5">
            PhD Outreach & Discovery
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              FUNDING-FIRST
            </span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Displaying funded PhD positions & studentships matching Dr. Shama Abidi&apos;s research
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/find"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs sm:text-sm font-medium shadow-lg hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' }}
          >
            <Search className="w-4 h-4" />
            Find Funded PhDs
          </Link>
        </div>
      </div>

      {/* PRIMARY TABS: Funded vs Possible supervisors (no funding found) */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => {
            setActiveTab('funded');
            setFilterStatus('all');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'funded'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-400/30'
              : 'glass text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <Sparkles className="w-4 h-4 text-emerald-300" />
          <span>Funded PhD Positions</span>
          <span className="bg-black/30 px-2 py-0.5 rounded-full text-xs font-mono">
            {fundedProfessors.length}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('unfunded');
            setFilterStatus('all');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'unfunded'
              ? 'bg-slate-700 text-white ring-1 ring-white/30'
              : 'glass text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <HelpCircle className="w-4 h-4 text-slate-400" />
          <span>Possible supervisors (no funding found)</span>
          <span className="bg-white/10 px-2 py-0.5 rounded-full text-xs font-mono">
            {unfundedProfessors.length}
          </span>
        </button>
      </div>

      {/* Banner for Unfunded Tab */}
      {activeTab === 'unfunded' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-slate-300 space-y-1">
            <p className="font-semibold text-amber-300">
              Possible Supervisors (No Active Funding Advertisement Found)
            </p>
            <p className="text-slate-400 leading-relaxed">
              These professors were discovered through publication records matching Dr. Shama Abidi&apos;s research. However, no active funded PhD studentship or scholarship advertisement was found for them. Under the <strong>FUNDING-FIRST policy</strong>, they are excluded from the main outreach list and do <strong>not</strong> receive automated email inquiry drafts.
            </p>
          </div>
        </div>
      )}

      {/* Funded Sub-filters & Controls */}
      {activeTab === 'funded' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Status Sub-filters */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterStatus === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'glass text-slate-400 hover:text-white'
              }`}
            >
              All Funded ({fundedProfessors.length})
            </button>
            <button
              onClick={() => setFilterStatus('draft')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterStatus === 'draft'
                  ? 'bg-emerald-600 text-white'
                  : 'glass text-slate-400 hover:text-emerald-300'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Draft Ready</span>
              <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">
                {fundedProfessors.filter((p) => p.status === 'draft').length}
              </span>
            </button>
            <button
              onClick={() => setFilterStatus('needs_review')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterStatus === 'needs_review'
                  ? 'bg-amber-600 text-white'
                  : 'glass text-slate-400 hover:text-amber-300'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Needs Review</span>
              <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">
                {fundedProfessors.filter((p) => p.status === 'needs_review').length}
              </span>
            </button>
            <button
              onClick={() => setFilterStatus('sent')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterStatus === 'sent'
                  ? 'bg-blue-600 text-white'
                  : 'glass text-slate-400 hover:text-white'
              }`}
            >
              Sent ({fundedProfessors.filter((p) => p.status === 'sent' || p.status === 'followup_sent').length})
            </button>
            <button
              onClick={() => setFilterStatus('replied')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterStatus === 'replied'
                  ? 'bg-teal-600 text-white'
                  : 'glass text-slate-400 hover:text-white'
              }`}
            >
              Replied ({fundedProfessors.filter((p) => p.status === 'replied').length})
            </button>
          </div>

          {/* Sort & Hide Expired Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="deadline">Sort: Nearest Deadline</option>
              <option value="recent">Sort: Recently Added</option>
            </select>

            <label className="flex items-center gap-2 cursor-pointer glass px-3 py-1.5 rounded-xl border border-white/10 text-xs text-slate-300 select-none">
              <input
                type="checkbox"
                checked={hideExpired}
                onChange={(e) => setHideExpired(e.target.checked)}
                className="rounded accent-emerald-500 w-3.5 h-3.5"
              />
              Hide expired ads
            </label>
          </div>
        </div>
      )}

      {/* Search & Country Select */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder={
              activeTab === 'funded'
                ? 'Search funded PhDs by project title, supervisor, university, or match reason...'
                : 'Search possible supervisors by name, university, or publication...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs sm:text-sm"
          />
        </div>
        <select
          value={filterCountry}
          onChange={(e) => setFilterCountry(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="all">All Countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden border border-white/10">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-indigo-400" />
            </div>
            <p className="text-white font-medium mb-1">
              {activeTab === 'funded' ? 'No funded PhD positions found' : 'No candidates found'}
            </p>
            <p className="text-slate-400 text-sm max-w-sm mb-4">
              {activeTab === 'funded'
                ? 'No funded positions match your current filter settings. Click below to run a funding-first search.'
                : 'No unfunded candidates match your search filters.'}
            </p>
            {activeTab === 'funded' && (
              <Link
                href="/find"
                className="px-5 py-2 rounded-xl text-white text-xs font-semibold"
                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' }}
              >
                Find Funded PhDs Now
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3">
                    {activeTab === 'funded' ? 'PhD Project & Supervisor' : 'Researcher & Institution'}
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3">
                    {activeTab === 'funded' ? 'Funding & Eligibility' : 'Research Match'}
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3">
                    {activeTab === 'funded' ? 'Application Deadline' : 'Publication'}
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3">
                    {activeTab === 'funded' ? 'Supervisor Email' : 'Email Status'}
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((prof) => {
                  const matchScore = calculateProfessorMatchScore(prof);
                  return (
                  <tr
                    key={prof.id}
                    onClick={() => router.push(`/professors/${prof.id}`)}
                    className="table-row-hover cursor-pointer transition-colors"
                  >
                    {/* Column 1: Professor & Project */}
                    <td className="px-5 py-4">
                      <div className="space-y-1.5 max-w-[320px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 border ${
                              matchScore >= 92
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                                : matchScore >= 85
                                ? 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                                : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                            }`}
                          >
                            <Sparkles className="w-3 h-3 text-emerald-400" />
                            {matchScore}% Match
                          </span>
                        </div>
                        <div className="text-white text-sm font-semibold line-clamp-2">
                          {prof.recentPaper || prof.name}
                        </div>
                        <div className="text-slate-400 text-xs flex items-center gap-1.5">
                          <Building2 className="w-3 h-3 text-slate-500 flex-shrink-0" />
                          <span className="truncate">{prof.university}</span>
                          {prof.country && <span className="flex-shrink-0">• {prof.country}</span>}
                        </div>
                        {prof.name && prof.recentPaper && (
                          <div className="text-slate-300 text-xs">
                            Supervisor: <strong className="text-white">{prof.name}</strong>
                          </div>
                        )}
                        {prof.matchReason && (
                          <div className="text-indigo-300 text-[11px] line-clamp-2 mt-1">
                            🎯 {prof.matchReason}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Column 2: Funding & Eligibility (or Research Match) */}
                    <td className="px-5 py-4">
                      {activeTab === 'funded' ? (
                        <div className="space-y-1.5 max-w-[240px]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                                FUNDING_CLASSIFICATION_COLORS[
                                  prof.fundingClassification || 'fully_funded'
                                ]
                              }`}
                            >
                              {FUNDING_CLASSIFICATION_LABELS[
                                prof.fundingClassification || 'fully_funded'
                              ]}
                            </span>
                          </div>
                          {prof.fundingAmount && (
                            <p className="text-xs text-emerald-300 font-mono">
                              💰 {prof.fundingAmount}
                              {prof.stipendDuration ? (
                                <span className="text-slate-400 font-sans text-[11px]"> ({prof.stipendDuration})</span>
                              ) : null}
                            </p>
                          )}
                          {prof.tuitionCoverage && prof.tuitionCoverage !== 'unknown' && (
                            <p className="text-[11px] text-teal-300/90 flex items-center gap-1">
                              <span>🎓 Tuition:</span>
                              <span className="font-medium">
                                {prof.tuitionCoverage === 'full'
                                  ? '100% Full Waiver'
                                  : prof.tuitionCoverage === 'partial'
                                  ? 'Partial Waiver'
                                  : 'Not Covered'}
                              </span>
                            </p>
                          )}
                          <p className="text-[11px] text-slate-400 line-clamp-2">
                            🌍 {prof.eligibilitySnippet || 'International students eligible'}
                          </p>
                          {prof.englishRequirements && (
                            <p className="text-[11px] text-slate-300 line-clamp-1">
                              🗣️ {prof.englishRequirements}
                            </p>
                          )}
                          <div className="flex items-center gap-3 pt-0.5 flex-wrap">
                            {prof.officialApplicationUrl && (
                              <a
                                href={prof.officialApplicationUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Official Portal
                              </a>
                            )}
                            {(prof.adUrl || prof.fundingSourceUrl) && (
                              <a
                                href={prof.adUrl || prof.fundingSourceUrl || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Original ad
                              </a>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1 max-w-[220px]">
                          <span className="text-xs text-slate-400 px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                            No funding ad found
                          </span>
                          <p className="text-xs text-slate-300 line-clamp-2 mt-1">
                            {prof.researchArea || 'Clinical pharmacy'}
                          </p>
                        </div>
                      )}
                    </td>

                    {/* Column 3: Deadline (Prominent) */}
                    <td className="px-5 py-4">
                      {activeTab === 'funded' ? (
                        <div className="space-y-1">
                          {renderDeadlineBadge(prof.deadline, prof.deadlineDate)}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 line-clamp-2 max-w-[200px]">
                          {prof.recentPaper || 'N/A'}
                        </div>
                      )}
                    </td>

                    {/* Column 4: Email & Verification */}
                    <td className="px-5 py-4">
                      <div className="space-y-1">
                        {prof.email ? (
                          <span className="text-slate-200 text-xs font-mono block truncate max-w-[180px]">
                            {prof.email}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs italic block">
                            Email not published
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${
                            VERIFICATION_COLORS[prof.verificationLevel || 'unverified']
                          }`}
                        >
                          {prof.verificationLevel === 'verified' && (
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          )}
                          {VERIFICATION_LABELS[prof.verificationLevel || 'unverified']}
                        </span>
                        {prof.emailSourceUrl && (
                          <a
                            href={prof.emailSourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 mt-0.5"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                            Official page
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Column 5: Status */}
                    <td className="px-5 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${STATUS_COLORS[prof.status]}`}>
                        {STATUS_LABELS[prof.status]}
                      </span>
                    </td>

                    {/* Column 6: Arrow */}
                    <td className="px-5 py-4 text-right">
                      <ChevronRight className="w-4 h-4 text-slate-500 inline" />
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
