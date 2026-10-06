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
  calculateProfessorMatchScore,
  getFundingTimeline,
} from '@/lib/types';
import {
  Users,
  Search,
  ChevronRight,
  Loader2,
  ExternalLink,
  Mail,
  Building2,
  ShieldCheck,
  Clock,
  Sparkles,
  CheckCircle2,
  Send,
  X,
  FileText,
  MessageSquare,
  RotateCw,
} from 'lucide-react';
import Link from 'next/link';

type MainViewTab = 'all' | 'ready_to_send' | 'sent' | 'replied' | 'funded' | 'with_email';

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
  const [activeTab, setActiveTab] = useState<MainViewTab>('all');
  const [filterCountry, setFilterCountry] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'match' | 'deadline' | 'recent'>('match');
  const [hideExpired, setHideExpired] = useState(false);

  // Sending state
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [isBatchSending, setIsBatchSending] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    sent: number;
    total: number;
    completed?: boolean;
    error?: string;
  } | null>(null);
  const [isSyncingGmail, setIsSyncingGmail] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    // Background auto-sync Gmail replies on mount
    fetch('/api/sync-replies').catch(() => {});

    const q = query(collection(db, 'professors'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => {
        const raw = doc.data();
        return {
          id: doc.id,
          ...raw,
          createdAt: raw.createdAt?.toDate ? raw.createdAt.toDate() : new Date(),
          sentAt: raw.sentAt?.toDate ? raw.sentAt.toDate() : null,
          repliedAt: raw.repliedAt?.toDate ? raw.repliedAt.toDate() : null,
        };
      }) as Professor[];
      setProfessors(data);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const todayIso = new Date().toISOString().slice(0, 10);

  // Datasets
  const professorsWithEmail = professors.filter(
    (p) => p.email && typeof p.email === 'string' && p.email.includes('@')
  );

  const eligibleToEmail = professorsWithEmail.filter(
    (p) => p.status !== 'sent' && p.status !== 'followup_sent' && p.status !== 'replied'
  );

  const fundedProfessors = professors.filter(
    (p) => p.hasFundingAd === true || (p.fundingAvailable === 'yes' && p.status !== 'unfunded_candidate')
  );

  const sentProfessors = professors.filter(
    (p) => p.status === 'sent' || p.status === 'followup_sent'
  );

  const repliedProfessors = professors.filter(
    (p) => p.status === 'replied'
  );

  // Choose dataset by active tab
  let currentDataset: Professor[] = [];
  if (activeTab === 'all') currentDataset = professors;
  else if (activeTab === 'ready_to_send') currentDataset = eligibleToEmail;
  else if (activeTab === 'sent') currentDataset = sentProfessors;
  else if (activeTab === 'replied') currentDataset = repliedProfessors;
  else if (activeTab === 'funded') currentDataset = fundedProfessors;
  else if (activeTab === 'with_email') currentDataset = professorsWithEmail;

  const countries = Array.from(new Set(currentDataset.map((p) => p.country).filter(Boolean))).sort();

  const filtered = currentDataset.filter((p) => {
    if (filterCountry !== 'all' && p.country !== filterCountry) return false;

    if (hideExpired && p.deadlineDate && p.deadlineDate < todayIso) {
      return false;
    }

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
    if (sortBy === 'match') {
      const scoreA = calculateProfessorMatchScore(a);
      const scoreB = calculateProfessorMatchScore(b);
      return scoreB - scoreA;
    }
    if (sortBy === 'deadline') {
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

  // Action: Single Professor Send
  const handleSendSingle = async (profId: string) => {
    setSendingId(profId);
    setActionNotice(null);
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professorId: profId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to send email');
      } else {
        setActionNotice(`✅ Email successfully sent to ${data.name} (${data.email})!`);
        setTimeout(() => setActionNotice(null), 5000);
      }
    } catch (err: any) {
      alert(err.message || 'Send error');
    } finally {
      setSendingId(null);
    }
  };

  // Action: Batch Send All Eligible
  const handleBatchSend = async () => {
    setIsBatchSending(true);
    setBatchProgress({ sent: 0, total: eligibleToEmail.length });
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendAll: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBatchProgress({
          sent: 0,
          total: eligibleToEmail.length,
          error: data.error || 'Batch send failed',
        });
      } else {
        setBatchProgress({
          sent: data.sentCount || 0,
          total: eligibleToEmail.length,
          completed: true,
        });
      }
    } catch (err: any) {
      setBatchProgress({
        sent: 0,
        total: eligibleToEmail.length,
        error: err.message || 'Batch send error',
      });
    } finally {
      setIsBatchSending(false);
    }
  };

  // Action: Generate All Drafts
  const handleGenerateAllDrafts = async () => {
    setIsGeneratingAll(true);
    setActionNotice(null);
    try {
      const res = await fetch('/api/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generateAll: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionNotice(`✨ Drafts generated! ${data.message || 'All eligible professors now have email drafts ready.'}`);
        setTimeout(() => setActionNotice(null), 6000);
      } else {
        alert(data.error || 'Draft generation failed');
      }
    } catch (e: any) {
      alert(e.message || 'Failed to generate drafts');
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const handleSyncGmailReplies = async () => {
    setIsSyncingGmail(true);
    setActionNotice(null);
    try {
      const res = await fetch('/api/sync-replies', { method: 'POST' });
      const data = await res.json();
      if (data.repliesDetected > 0) {
        setActionNotice(`🎉 ${data.repliesDetected} professor reply detected and synced from Gmail!`);
      } else {
        setActionNotice('✅ Gmail sync complete. Checked inbox, no new replies.');
      }
      setTimeout(() => setActionNotice(null), 6000);
    } catch (e: any) {
      alert('Gmail sync error: ' + (e?.message || 'Check connection'));
    } finally {
      setIsSyncingGmail(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5">
            PhD Outreach & Supervisor CRM
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {professorsWithEmail.length} With Email
            </span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Matching Dr. Shama Abidi&apos;s research: Antimicrobial Stewardship, Clinical Pharmacy, Medication Safety & Cardiology
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleSyncGmailReplies}
            disabled={isSyncingGmail}
            id="sync-gmail-btn"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium glass text-teal-300 hover:text-white hover:bg-teal-500/10 border border-teal-500/30 transition-all disabled:opacity-50 cursor-pointer"
          >
            <RotateCw className={`w-4 h-4 text-teal-400 ${isSyncingGmail ? 'animate-spin' : ''}`} />
            <span>{isSyncingGmail ? 'Checking Gmail…' : 'Sync Gmail Replies'}</span>
          </button>

          <button
            onClick={handleGenerateAllDrafts}
            disabled={isGeneratingAll}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium glass text-indigo-300 hover:text-white hover:bg-white/10 border border-indigo-500/30 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isGeneratingAll ? (
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            ) : (
              <FileText className="w-4 h-4 text-indigo-400" />
            )}
            <span>Generate Drafts</span>
          </button>

          <button
            onClick={() => {
              setShowBatchModal(true);
              setBatchProgress(null);
            }}
            disabled={eligibleToEmail.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs sm:text-sm font-semibold shadow-lg shadow-emerald-900/30 transition-all hover:brightness-110 disabled:opacity-50 cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
          >
            <Send className="w-4 h-4" />
            <span>⚡ Send to All Eligible ({eligibleToEmail.length})</span>
          </button>

          <Link
            href="/find"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs sm:text-sm font-medium shadow-lg hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' }}
          >
            <Search className="w-4 h-4" />
            Find More PhDs
          </Link>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionNotice && (
        <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs sm:text-sm px-4 py-3 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-emerald-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* PRIMARY NAVIGATION TABS */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'all'
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20 ring-1 ring-indigo-400/30'
              : 'glass text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <Users className="w-4 h-4 text-indigo-300" />
          <span>All Discovered Supervisors</span>
          <span className="bg-black/30 px-2 py-0.5 rounded-full text-xs font-mono">
            {professors.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('ready_to_send')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'ready_to_send'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-400/30'
              : 'glass text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <Mail className="w-4 h-4 text-emerald-300" />
          <span>⚡ Ready to Send (Unsent)</span>
          <span className="bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full text-xs font-mono font-bold">
            {eligibleToEmail.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('sent')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'sent'
              ? 'bg-blue-600 text-white ring-1 ring-blue-400/30 shadow-lg shadow-blue-500/20'
              : 'glass text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-blue-300" />
          <span>✅ Already Sent</span>
          <span className="bg-blue-950/60 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full text-xs font-mono font-bold">
            {sentProfessors.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('replied')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'replied'
              ? 'bg-teal-600 text-white ring-1 ring-teal-400/30 shadow-lg shadow-teal-500/20'
              : 'glass text-teal-300 hover:text-white hover:bg-teal-500/10'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-teal-400" />
          <span>💬 Replied</span>
          <span className="bg-teal-950/80 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded-full text-xs font-mono font-bold">
            {repliedProfessors.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('funded')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'funded'
              ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-lg ring-1 ring-teal-400/30'
              : 'glass text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <Sparkles className="w-4 h-4 text-teal-300" />
          <span>Funded PhD Positions</span>
          <span className="bg-black/30 px-2 py-0.5 rounded-full text-xs font-mono">
            {fundedProfessors.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('with_email')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
            activeTab === 'with_email'
              ? 'bg-purple-600 text-white ring-1 ring-purple-400/30'
              : 'glass text-slate-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <Mail className="w-4 h-4 text-purple-300" />
          <span>All With Email</span>
          <span className="bg-white/10 px-2 py-0.5 rounded-full text-xs font-mono">
            {professorsWithEmail.length}
          </span>
        </button>
      </div>

      {/* Search, Country & Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by professor name, university, paper title, or email..."
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

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="match">Sort: Highest Match Score</option>
          <option value="deadline">Sort: Application Deadline</option>
          <option value="recent">Sort: Recently Added</option>
        </select>
      </div>

      {/* Table Container */}
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
            <p className="text-white font-medium mb-1">No professors found</p>
            <p className="text-slate-400 text-sm max-w-sm mb-4">
              No matching supervisors found for the selected view or search criteria.
            </p>
            <Link
              href="/find"
              className="px-5 py-2 rounded-xl text-white text-xs font-semibold"
              style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' }}
            >
              Discover More Supervisors
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3">
                    Supervisor & Recent Paper
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3">
                    Research Match & Area
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3">
                    Funding & Deadline
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3">
                    Email Address
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-300 px-5 py-3">
                    Status
                  </th>
                  <th className="text-right text-xs font-semibold text-slate-300 px-5 py-3">
                    Send Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((prof) => {
                  const matchScore = calculateProfessorMatchScore(prof);
                  const isSent = prof.status === 'sent' || prof.status === 'followup_sent';
                  const hasEmail = Boolean(prof.email && prof.email.includes('@'));

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
                                matchScore >= 90
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                                  : matchScore >= 80
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

                          {prof.status === 'replied' && (
                            <div className="mt-1.5 p-2 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-200 text-xs">
                              <div className="flex items-center gap-1.5 font-bold text-teal-300 text-[11px]">
                                <MessageSquare className="w-3 h-3 flex-shrink-0" />
                                <span>{prof.replyType === 'auto_reply' ? 'Auto-Reply / Out of Office' : 'Professor Replied'}</span>
                              </div>
                              {prof.replySnippet && (
                                <p className="mt-1 text-[11px] text-slate-200 line-clamp-2 italic font-mono leading-tight">
                                  &ldquo;{prof.replySnippet}&rdquo;
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Column 2: Research Match & Area */}
                      <td className="px-5 py-4">
                        <div className="space-y-1 max-w-[240px]">
                          <p className="text-xs text-indigo-300 font-medium line-clamp-2">
                            {prof.researchArea || 'Clinical Pharmacy & Practice'}
                          </p>
                          {prof.matchReason && (
                            <p className="text-[11px] text-slate-400 line-clamp-2">
                              🎯 {prof.matchReason}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Column 3: Funding & Deadline */}
                      <td className="px-5 py-4">
                        <div className="space-y-1.5 max-w-[200px]">
                          {prof.fundingAvailable === 'yes' ? (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-block">
                              {prof.fundingType || 'Fully Funded PhD'}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 inline-block">
                              PhD Research Group
                            </span>
                          )}

                          {renderDeadlineBadge(prof.deadline, prof.deadlineDate)}

                          <div className="flex items-center gap-2 pt-0.5">
                            {prof.adUrl && (
                              <a
                                href={prof.adUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                                Ad Source
                              </a>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Column 4: Email Address */}
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          {hasEmail ? (
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
                        </div>
                      </td>

                      {/* Column 5: Status */}
                      <td className="px-5 py-4">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${STATUS_COLORS[prof.status]}`}>
                          {STATUS_LABELS[prof.status]}
                        </span>
                      </td>

                      {/* Column 6: 1-Click Send Action */}
                      <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {prof.status === 'replied' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-500/10 text-teal-300 border border-teal-500/30">
                              <MessageSquare className="w-3.5 h-3.5" />
                              Replied
                            </span>
                          ) : isSent ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Sent
                            </span>
                          ) : hasEmail ? (
                            <button
                              type="button"
                              onClick={() => handleSendSingle(prof.id!)}
                              disabled={sendingId === prof.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-md shadow-emerald-900/30 transition-all disabled:opacity-50 cursor-pointer"
                            >
                              {sendingId === prof.id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Sending...</span>
                                </>
                              ) : (
                                <>
                                  <Mail className="w-3.5 h-3.5" />
                                  <span>Send Email</span>
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-500 italic">No email</span>
                          )}

                          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* BATCH SEND CONFIRMATION & PROGRESS MODAL */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="glass bg-slate-900/95 border border-white/20 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-white">Batch Send PhD Outreach</h3>
              </div>
              {!isBatchSending && (
                <button
                  onClick={() => setShowBatchModal(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {batchProgress?.completed ? (
              <div className="text-center py-6 space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-lg font-bold text-white">Outreach Emails Sent!</h4>
                <p className="text-slate-300 text-sm">
                  Successfully dispatched <strong>{batchProgress.sent}</strong> personalized emails with CV attachment directly from <strong>shamaabidiphd@gmail.com</strong>.
                </p>
                <button
                  onClick={() => setShowBatchModal(false)}
                  className="px-6 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            ) : isBatchSending ? (
              <div className="space-y-4 py-4 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-emerald-400 mx-auto" />
                <h4 className="text-base font-semibold text-white">Dispatching Emails via Google SMTP...</h4>
                <p className="text-xs text-slate-400">
                  Sending personalized emails with a 1.5-second pacing delay to maintain optimal Google deliverability.
                </p>
                <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                  <div className="bg-emerald-500 h-2 rounded-full animate-pulse w-3/4" />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-emerald-200 space-y-1.5">
                  <p className="font-semibold text-emerald-300">
                    Ready to send to {eligibleToEmail.length} eligible professors:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    <li>Sender: <strong>Dr. Shama Abidi (shamaabidiphd@gmail.com)</strong></li>
                    <li>Attachment: <strong>Dr. Shama&apos;s CV attached</strong> to each inquiry</li>
                    <li>Content: <strong>Tailored academic inquiry</strong> referencing their recent research</li>
                    <li>Delivery: <strong>Google SMTP direct dispatch</strong> with 1.5s rate pacing</li>
                  </ul>
                </div>

                {batchProgress?.error && (
                  <div className="bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs p-3 rounded-xl">
                    ⚠️ {batchProgress.error}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => setShowBatchModal(false)}
                    className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium glass text-slate-300 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBatchSend}
                    className="px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
                  >
                    Confirm & Send to {eligibleToEmail.length} Professors
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
