'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
  Professor,
  STATUS_LABELS,
  STATUS_COLORS,
  VERIFICATION_LABELS,
  VERIFICATION_COLORS,
  DEFAULT_PROFILE,
  UserProfile,
  calculateProfessorMatchScore,
  getFundingTimeline,
} from '@/lib/types';
import {
  Users,
  Send,
  MessageSquare,
  AlertCircle,
  Plus,
  Search,
  ChevronRight,
  Loader2,
  Calendar,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  RotateCw,
  Sparkles,
  HelpCircle,
  Clock,
  Eye,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow, isToday } from 'date-fns';

const STATUS_ORDER: Professor['status'][] = [
  'draft',
  'needs_review',
  'sent',
  'followup_draft',
  'followup_sent',
  'replied',
  'bounced',
  'new',
  'email_not_found',
];

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

function StatCard({ label, value, subValue, icon: Icon, color, bgColor }: StatCardProps) {
  return (
    <div className="glass rounded-2xl p-3.5 sm:p-5 flex items-center justify-between gap-2.5 sm:gap-4 transition-all hover:border-white/20">
      <div className="space-y-0.5 sm:space-y-1 min-w-0 flex-1">
        <p className="text-slate-400 text-[10px] sm:text-xs font-medium uppercase tracking-wider truncate">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-white tracking-tight">{value}</p>
        {subValue && <p className="text-[10px] sm:text-xs text-slate-400 truncate">{subValue}</p>}
      </div>
      <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${bgColor}`}>
        <Icon className={`w-4 h-4 sm:w-6 sm:h-6 ${color}`} />
      </div>
    </div>
  );
}

function getDeadlineBadge(deadline?: string | null, deadlineDate?: string | null) {
  const info = getFundingTimeline(deadline, deadlineDate);

  return (
    <div className="space-y-1">
      <span className={`text-xs px-2.5 py-0.5 rounded-md inline-flex items-center gap-1.5 ${info.badgeClass}`}>
        <Clock className="w-3 h-3 flex-shrink-0" />
        <span>{info.badgeText}</span>
      </span>
      {info.status === 'closing_soon' && (
        <p className="text-[10px] text-amber-300 font-medium leading-tight">
          ⚠️ Apply before this date — funding closes after
        </p>
      )}
      {info.isExpired && (
        <p className="text-[10px] text-rose-300 font-medium leading-tight">
          ⛔ Closed — cannot apply anymore
        </p>
      )}
    </div>
  );
}

// Add Professor Modal
function AddProfessorModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    name: '',
    university: '',
    country: '',
    email: '',
    researchArea: '',
    sourceUrl: '',
    recentPaper: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.university.trim()) {
      setError('Name and university are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await addDoc(collection(db, 'professors'), {
        ...form,
        email: form.email.trim() || null,
        emailSourceUrl: form.sourceUrl.trim() || null,
        profileSourceUrl: form.sourceUrl.trim() || null,
        evidenceSnippet: form.email.trim() ? `Manually added contact for ${form.name}` : null,
        matchReason: `Manual entry: ${form.researchArea || 'Clinical pharmacy research'}`,
        fundingAvailable: 'unknown',
        fundingSource: null,
        fundingSourceUrl: null,
        deadline: 'not_stated',
        deadlineDate: null,
        deadlineSourceUrl: null,
        verificationLevel: form.email.trim() ? 'verified' : 'unverified',
        status: form.email.trim() ? 'draft' : 'email_not_found',
        sentAt: null,
        createdAt: serverTimestamp(),
      });
      onAdded();
      onClose();
    } catch {
      setError('Failed to save professor. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass rounded-2xl p-6 sm:p-8 max-w-lg w-full space-y-5 border border-white/10 shadow-2xl">
        <h2 className="text-lg font-bold text-white">Add Professor Manually</h2>
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 text-red-300 text-xs">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Full Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Dr. Alastair Hay"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">University *</label>
              <input
                type="text"
                required
                placeholder="e.g. University of Bristol"
                value={form.university}
                onChange={(e) => handleChange('university', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Country</label>
              <input
                type="text"
                placeholder="e.g. United Kingdom"
                value={form.country}
                onChange={(e) => handleChange('country', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
            <input
              type="email"
              placeholder="e.g. alastair.hay@bristol.ac.uk"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Research Area</label>
            <input
              type="text"
              placeholder="e.g. Antimicrobial stewardship, primary care"
              value={form.researchArea}
              onChange={(e) => handleChange('researchArea', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Source URL (Faculty Page)</label>
            <input
              type="url"
              placeholder="https://..."
              value={form.sourceUrl}
              onChange={(e) => handleChange('sourceUrl', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl text-white text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Professor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [professors, setProfessors] = useState<Professor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCountry, setFilterCountry] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'deadline'>('recent');
  const [hideExpired, setHideExpired] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [dailyTarget, setDailyTarget] = useState(30);
  const [statsData, setStatsData] = useState<{
    tavilyStatus: string;
    nextCombination: { topic: string; country: string } | null;
    recentLogs: Array<{ id: string; type: string; message: string; createdAt: any }>;
  }>({
    tavilyStatus: 'active',
    nextCombination: null,
    recentLogs: [],
  });
  const [isSyncingGmail, setIsSyncingGmail] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [tavilyUsage, setTavilyUsage] = useState<{
    usage: number;
    limit: number | null;
    plan: string;
  } | null>(null);

  const handleSyncGmailReplies = async () => {
    setIsSyncingGmail(true);
    setSyncNotice(null);
    try {
      const res = await fetch('/api/sync-replies', { method: 'POST' });
      const data = await res.json();
      if (data.repliesDetected > 0) {
        setSyncNotice(`🎉 ${data.repliesDetected} professor reply detected and synced from Gmail!`);
      } else {
        setSyncNotice('✅ Gmail sync complete. Checked inbox, no new replies.');
      }
      setTimeout(() => setSyncNotice(null), 6000);
    } catch (e: any) {
      setSyncNotice('❌ Gmail sync failed: ' + (e?.message || 'Check connection'));
      setTimeout(() => setSyncNotice(null), 6000);
    } finally {
      setIsSyncingGmail(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    // Background auto-sync Gmail replies on mount
    fetch('/api/sync-replies').catch(() => {});

    // Load profile for daily target
    getDoc(doc(db, 'profile', 'main'))
      .then((snap) => {
        if (snap.exists()) {
          const p = snap.data() as UserProfile;
          if (p.dailyFindTarget) setDailyTarget(p.dailyFindTarget);
        }
      })
      .catch(console.error);

    // Fetch stats API
    fetch('/api/stats')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setStatsData({
            tavilyStatus: d.stats?.tavilyStatus || 'active',
            nextCombination: d.nextCombination || null,
            recentLogs: d.recentLogs || [],
          });
        }
      })
      .catch(console.error);

    // Fetch Tavily monthly usage from official endpoint
    fetch('/api/tavily/usage')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setTavilyUsage({
            usage: d.usage,
            limit: d.limit,
            plan: d.plan,
          });
        }
      })
      .catch(console.error);

    // Real-time listener for professors
    const q = query(collection(db, 'professors'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => {
        const raw = doc.data();
        const createdDate = raw.createdAt?.toDate ? raw.createdAt.toDate() : raw.createdAt ? new Date(raw.createdAt) : new Date();
        const sentDate = raw.sentAt?.toDate ? raw.sentAt.toDate() : raw.sentAt ? new Date(raw.sentAt) : null;
        const repliedDate = raw.repliedAt?.toDate ? raw.repliedAt.toDate() : raw.repliedAt ? new Date(raw.repliedAt) : null;
        return {
          id: doc.id,
          ...raw,
          createdAt: createdDate,
          sentAt: sentDate,
          repliedAt: repliedDate,
        };
      }) as Professor[];
      setProfessors(data);
      setLoading(false);
    });

    return unsub;
  }, [user]);

  const todayIso = new Date().toISOString().slice(0, 10);

  // Strict Partition: Main list = Funded PhDs; Separate tab = Possible supervisors (no funding found)
  const fundedProfessors = professors.filter(
    (p) => p.hasFundingAd === true || (p.fundingAvailable === 'yes' && p.status !== 'unfunded_candidate')
  );
  const unfundedProfessors = professors.filter(
    (p) => !(p.hasFundingAd === true || (p.fundingAvailable === 'yes' && p.status !== 'unfunded_candidate'))
  );

  const todayFoundCount = fundedProfessors.filter((p) => p.createdAt && isToday(p.createdAt)).length;
  const verifiedCount = fundedProfessors.filter((p) => p.status === 'draft' || p.verificationLevel === 'verified').length;
  const needsReviewCount = fundedProfessors.filter((p) => p.status === 'needs_review').length;
  const totalWithEmail = fundedProfessors.filter((p) => Boolean(p.email) && p.status !== 'email_not_found').length;
  const remainingQuota = Math.max(0, dailyTarget - todayFoundCount);

  const isUnfundedTab = filterStatus === 'unfunded';
  const baseList = isUnfundedTab ? unfundedProfessors : fundedProfessors;

  const countries = Array.from(new Set(baseList.map((p) => p.country).filter(Boolean))).sort();

  // Filtered and Sorted list
  const filtered = baseList.filter((p) => {
    if (!isUnfundedTab) {
      if (filterStatus === 'verified_draft') {
        if (p.status !== 'draft') return false;
      } else if (filterStatus === 'needs_review') {
        if (p.status !== 'needs_review') return false;
      } else if (filterStatus === 'sent') {
        if (p.status !== 'sent' && p.status !== 'followup_sent') return false;
      } else if (filterStatus === 'replied') {
        if (p.status !== 'replied') return false;
      }

      // Hide expired deadlines if toggle is active
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
        (p.email && p.email.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Sort: Nearest deadline first by default for funded ads
  filtered.sort((a, b) => {
    if (!isUnfundedTab && sortBy === 'deadline') {
      const aExpired = Boolean(a.deadlineDate && a.deadlineDate < todayIso);
      const bExpired = Boolean(b.deadlineDate && b.deadlineDate < todayIso);
      if (aExpired !== bExpired) return aExpired ? 1 : -1;

      const aDate = a.deadlineDate || (a.deadline?.toLowerCase().includes('rolling') ? '9998' : '9999');
      const bDate = b.deadlineDate || (b.deadline?.toLowerCase().includes('rolling') ? '9998' : '9999');
      return aDate.localeCompare(bDate);
    }
    // Default by recent
    const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
    const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
    return bTime - aTime;
  });

  return (
    <div className="space-y-6 sm:space-y-8 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 flex-wrap">
            Outreach Dashboard
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Dr. Shama Abidi
            </span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Evidence-based PhD professor discovery & outreach
          </p>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3">
          <button
            onClick={handleSyncGmailReplies}
            disabled={isSyncingGmail}
            id="sync-gmail-btn"
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl text-teal-300 text-xs sm:text-sm font-medium glass border border-teal-500/30 hover:bg-teal-500/10 transition-colors cursor-pointer"
          >
            <RotateCw className={`w-4 h-4 text-teal-400 ${isSyncingGmail ? 'animate-spin' : ''}`} />
            <span>{isSyncingGmail ? 'Checking Gmail…' : 'Sync Gmail Replies'}</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            id="add-professor-btn"
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl text-white text-xs sm:text-sm font-medium glass border border-white/10 hover:bg-white/10 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Professor
          </button>
          <Link
            href="/find"
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-white text-xs sm:text-sm font-medium transition-all shadow-lg hover:brightness-110 text-center"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' }}
          >
            <Search className="w-4 h-4" />
            Find Professors
          </Link>
        </div>
      </div>

      {/* Sync Notice Alert */}
      {syncNotice && (
        <div className="bg-teal-500/10 border border-teal-500/30 text-teal-200 text-xs sm:text-sm px-4 py-3 rounded-xl flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-teal-400 flex-shrink-0" />
            <span>{syncNotice}</span>
          </div>
          <button onClick={() => setSyncNotice(null)} className="text-teal-400 hover:text-white cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* METRIC CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatCard
          label="Today's Found"
          value={todayFoundCount}
          subValue={`Target: ${dailyTarget} / day`}
          icon={Calendar}
          color="text-indigo-400"
          bgColor="bg-indigo-500/10"
        />
        <StatCard
          label="Daily target left"
          value={remainingQuota}
          subValue={`${todayFoundCount} of ${dailyTarget} found`}
          icon={Users}
          color="text-blue-400"
          bgColor="bg-blue-500/10"
        />
        <StatCard
          label="Tavily Credits Used"
          value={
            tavilyUsage
              ? `${tavilyUsage.usage}${tavilyUsage.limit ? ` / ${tavilyUsage.limit.toLocaleString()}` : ''}`
              : '...'
          }
          subValue={tavilyUsage ? `${tavilyUsage.plan} Plan (This Month)` : 'Checking usage...'}
          icon={Zap}
          color="text-purple-400"
          bgColor="bg-purple-500/10"
        />
        <StatCard
          label="Verified Ready"
          value={verifiedCount}
          subValue={`${totalWithEmail} with email`}
          icon={ShieldCheck}
          color="text-emerald-400"
          bgColor="bg-emerald-500/10"
        />
        <StatCard
          label="Needs Review"
          value={needsReviewCount}
          subValue="Partial evidence"
          icon={AlertTriangle}
          color="text-amber-400"
          bgColor="bg-amber-500/10"
        />
      </div>

      {/* TABS & CONTROLS */}
      <div className="space-y-3">
        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filterStatus === 'all'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                : 'glass text-slate-400 hover:text-white'
            }`}
          >
            All Funded ({fundedProfessors.length})
          </button>
          <button
            onClick={() => setFilterStatus('verified_draft')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filterStatus === 'verified_draft'
                ? 'bg-emerald-600 text-white'
                : 'glass text-slate-400 hover:text-emerald-300'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Verified Ready</span>
            <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">{verifiedCount}</span>
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
            <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">{needsReviewCount}</span>
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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              filterStatus === 'replied'
                ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20'
                : 'glass text-teal-300 hover:text-white hover:bg-teal-500/10'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-teal-400" />
            <span>Replied</span>
            <span className="bg-teal-950/80 text-teal-300 border border-teal-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold">
              {professors.filter((p) => p.status === 'replied').length}
            </span>
          </button>
          <button
            onClick={() => setFilterStatus('unfunded')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filterStatus === 'unfunded'
                ? 'bg-slate-700 text-white ring-1 ring-white/30'
                : 'glass text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            <span>Possible supervisors (no funding found)</span>
            <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">{unfundedProfessors.length}</span>
          </button>
        </div>

        {/* Search, Country & Deadline Controls */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by name, university, research match, or email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs sm:text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <select
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              className="flex-1 sm:flex-initial bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Countries</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="flex-1 sm:flex-initial bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="recent">Sort: Recently Added</option>
              <option value="deadline">Sort: Nearest Deadline</option>
            </select>

            <label className="flex items-center gap-2 cursor-pointer glass px-3 py-2 rounded-xl border border-white/10 text-xs text-slate-300 select-none">
              <input
                type="checkbox"
                checked={hideExpired}
                onChange={(e) => setHideExpired(e.target.checked)}
                className="rounded accent-indigo-500 w-3.5 h-3.5"
              />
              Hide expired
            </label>
          </div>
        </div>
      </div>

      {/* Professors Evidence Table */}
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
            <p className="text-slate-400 text-sm mb-6 max-w-sm">
              {professors.length === 0
                ? 'Your outreach database is empty. Click below to discover professors matching your research.'
                : 'No professors match your selected filters.'}
            </p>
            {professors.length === 0 && (
              <Link
                href="/find"
                className="px-6 py-2.5 rounded-xl text-white text-sm font-medium"
                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' }}
              >
                Find Professors Now
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="text-left text-xs font-semibold text-slate-300 px-4 py-3">Professor & Research Match</th>
                  <th className="text-left text-xs font-semibold text-slate-300 px-4 py-3">Email & Source</th>
                  <th className="text-left text-xs font-semibold text-slate-300 px-4 py-3">PhD Funding</th>
                  <th className="text-left text-xs font-semibold text-slate-300 px-4 py-3">Application Deadline</th>
                  <th className="text-left text-xs font-semibold text-slate-300 px-4 py-3">Verification</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((prof) => {
                  const matchScore = calculateProfessorMatchScore(prof);
                  return (
                  <tr
                    key={prof.id}
                    className="table-row-hover cursor-pointer transition-colors"
                    onClick={() => router.push(`/professors/${prof.id}`)}
                  >
                    {/* Professor & Match */}
                    <td className="px-4 py-3.5">
                      <div className="space-y-1 max-w-[280px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 border ${
                              matchScore >= 92
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                                : matchScore >= 85
                                ? 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                                : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                            }`}
                          >
                            <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                            {matchScore}% Match
                          </span>
                          <p className="text-white text-sm font-semibold hover:text-indigo-300 transition-colors">
                            {prof.name}
                          </p>
                          {prof.profileSourceUrl && (
                            <a
                              href={prof.profileSourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Open faculty profile page"
                              className="text-slate-400 hover:text-indigo-400"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        <p className="text-slate-300 text-xs truncate">
                          {prof.university} · <span className="text-slate-400">{prof.country}</span>
                        </p>
                        {prof.matchReason && (
                          <p className="text-indigo-300/80 text-[11px] line-clamp-2 leading-tight">
                            🎯 {prof.matchReason}
                          </p>
                        )}
                        {prof.status === 'replied' && (
                          <div className="mt-2 p-2 rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-200 text-xs">
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

                    {/* Email with Source Link */}
                    <td className="px-4 py-3.5">
                      {prof.email ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-white text-xs font-mono">{prof.email}</span>
                          </div>
                          {prof.emailSourceUrl ? (
                            <a
                              href={prof.emailSourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:underline"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              Open source page
                            </a>
                          ) : (
                            <span className="text-slate-500 text-[10px]">No link</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500 text-xs italic">Email not found</span>
                      )}
                    </td>

                    {/* PhD Funding Source */}
                    <td className="px-4 py-3.5">
                      <div className="space-y-1 max-w-[180px]">
                        {prof.fundingAvailable === 'yes' ? (
                          <>
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              Funded
                            </span>
                            {prof.fundingSource && (
                              <p className="text-[11px] text-slate-300 truncate" title={prof.fundingSource}>
                                {prof.fundingSource}
                              </p>
                            )}
                            {prof.fundingSourceUrl && (
                              <a
                                href={prof.fundingSourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:underline block"
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                                Source page
                              </a>
                            )}
                          </>
                        ) : prof.fundingAvailable === 'no' ? (
                          <span className="text-xs text-rose-400">No funding</span>
                        ) : (
                          <span className="text-slate-500 text-xs">Not stated</span>
                        )}
                      </div>
                    </td>

                    {/* Deadline */}
                    <td className="px-4 py-3.5">
                      <div className="space-y-1">
                        {getDeadlineBadge(prof.deadline, prof.deadlineDate)}
                        {prof.deadlineSourceUrl && (
                          <a
                            href={prof.deadlineSourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:underline block"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                            Source page
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Verification Level */}
                    <td className="px-4 py-3.5">
                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-lg inline-flex items-center gap-1 ${
                          VERIFICATION_COLORS[prof.verificationLevel || 'unverified']
                        }`}
                      >
                        {prof.verificationLevel === 'verified' && <ShieldCheck className="w-3 h-3 text-emerald-400" />}
                        {prof.verificationLevel === 'partial' && <AlertTriangle className="w-3 h-3 text-amber-400" />}
                        {VERIFICATION_LABELS[prof.verificationLevel || 'unverified']}
                      </span>
                    </td>

                    {/* Action Arrow */}
                    <td className="px-4 py-3.5 text-right">
                      <ChevronRight className="w-4 h-4 text-slate-500 inline-block" />
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add professor modal */}
      {showAddModal && (
        <AddProfessorModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => {}}
        />
      )}
    </div>
  );
}
