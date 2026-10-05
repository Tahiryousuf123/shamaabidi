'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Professor,
  Email,
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
  ArrowLeft,
  Send,
  RefreshCw,
  Trash2,
  Mail,
  Building2,
  Globe,
  ExternalLink,
  BookOpen,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Quote,
  DollarSign,
  Calendar,
  Sparkles,
  GraduationCap,
  Award,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

export default function ProfessorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [professor, setProfessor] = useState<Professor | null>(null);
  const [emailDraft, setEmailDraft] = useState<Email | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [sending, setSending] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const loadData = async () => {
    setLoadingPage(true);
    try {
      const profDoc = await getDoc(doc(db, 'professors', id));
      if (!profDoc.exists()) {
        router.push('/dashboard');
        return;
      }
      const profData = {
        id: profDoc.id,
        ...profDoc.data(),
        createdAt: profDoc.data()?.createdAt?.toDate
          ? profDoc.data().createdAt.toDate()
          : new Date(),
        sentAt: profDoc.data()?.sentAt?.toDate
          ? profDoc.data().sentAt.toDate()
          : null,
      } as Professor;
      setProfessor(profData);

      // Load draft email if any
      const emailQ = query(
        collection(db, 'emails'),
        where('professorId', '==', id),
        where('status', '==', 'draft')
      );
      const emailSnap = await getDocs(emailQ);
      if (!emailSnap.empty) {
        const emailDoc = emailSnap.docs[0];
        const emailData = { id: emailDoc.id, ...emailDoc.data() } as Email;
        setEmailDraft(emailData);
        setEditedSubject(emailData.subject);
        setEditedBody(emailData.body);
      } else if (profData.email && profData.status !== 'sent' && profData.status !== 'followup_sent') {
        // Auto-generate draft on load so Shama can review it immediately
        try {
          const genRes = await fetch('/api/generate-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ professorId: id }),
          });
          if (genRes.ok) {
            const genData = await genRes.json();
            setEditedSubject(genData.subject || '');
            setEditedBody(genData.body || '');
            setEmailDraft({
              id: genData.emailId,
              professorId: id,
              type: 'first',
              subject: genData.subject,
              body: genData.body,
              status: 'draft',
              createdAt: new Date(),
            });
          }
        } catch (e) {
          console.warn('Auto-draft generation on view failed:', e);
        }
      }
    } catch (err) {
      console.error(err);
      setActionError('Failed to load professor data.');
    } finally {
      setLoadingPage(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleSend = async () => {
    if (!professor?.email) {
      setActionError('This professor does not have an email address.');
      return;
    }

    setSending(true);
    setActionError('');
    setActionSuccess('');

    try {
      if (emailDraft?.id) {
        // Save changes to email draft first
        await updateDoc(doc(db, 'emails', emailDraft.id), {
          subject: editedSubject,
          body: editedBody,
        });
      }

      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professorId: id,
          emailId: emailDraft?.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Send failed');
      }

      setActionSuccess('Email sent directly from shamaabidiphd@gmail.com! Follow-up scheduled in 7 days.');
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to send email.');
    } finally {
      setSending(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setActionError('');
    setActionSuccess('');

    try {
      const res = await fetch('/api/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professorId: id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Regeneration failed');
      }

      setEditedSubject(data.subject);
      setEditedBody(data.body);
      setActionSuccess('Personalized email regenerated with Shama’s publications & research focus.');
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to regenerate email.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this professor and all associated emails? They will remain in the seen archive to prevent re-adding.')) return;
    setDeleting(true);
    try {
      const emailQ = query(collection(db, 'emails'), where('professorId', '==', id));
      const emailSnap = await getDocs(emailQ);
      for (const emailDoc of emailSnap.docs) {
        await deleteDoc(doc(db, 'emails', emailDoc.id));
      }
      await deleteDoc(doc(db, 'professors', id));
      router.push('/dashboard');
    } catch {
      setActionError('Delete failed. Please try again.');
      setDeleting(false);
    }
  };

  if (loadingPage) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (!professor) return null;

  const isVerified = professor.verificationLevel === 'verified';
  const alreadySent = professor.status === 'sent' || professor.status === 'followup_sent' || professor.status === 'replied';
  const canSend = !alreadySent && Boolean(professor.email && professor.email.includes('@'));

  const matchScore = calculateProfessorMatchScore(professor);
  const timelineInfo = getFundingTimeline(professor.deadline, professor.deadlineDate);

  return (
    <div className="space-y-6 max-w-3xl pb-12">
      {/* Back button */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </Link>

      {/* Professor Header Card */}
      <div className="glass rounded-2xl p-6 border border-white/10 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-white">{professor.name}</h1>
              {/* Match Score Badge */}
              <span
                className={`text-xs font-bold px-3 py-1 rounded-full inline-flex items-center gap-1.5 border shadow-sm ${
                  matchScore >= 92
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-500/10'
                    : matchScore >= 85
                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                    : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                {matchScore}% Match
              </span>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${STATUS_COLORS[professor.status]}`}>
                {STATUS_LABELS[professor.status]}
              </span>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
                  FUNDING_CLASSIFICATION_COLORS[professor.fundingClassification || 'fully_funded']
                }`}
              >
                {FUNDING_CLASSIFICATION_LABELS[professor.fundingClassification || 'fully_funded']}
              </span>
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded-lg inline-flex items-center gap-1 ${
                  VERIFICATION_COLORS[professor.verificationLevel || 'unverified']
                }`}
              >
                {professor.verificationLevel === 'verified' ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                )}
                {VERIFICATION_LABELS[professor.verificationLevel || 'unverified']}
              </span>
            </div>

            <div className="space-y-1.5 text-xs sm:text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>{professor.university} {professor.country ? `· ${professor.country}` : ''}</span>
              </div>
              {professor.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <a href={`mailto:${professor.email}`} className="text-indigo-300 hover:underline font-mono">
                    {professor.email}
                  </a>
                  {professor.emailSourceUrl && (
                    <a
                      href={professor.emailSourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:underline ml-2"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open source page
                    </a>
                  )}
                </div>
              )}
              {professor.profileSourceUrl && (
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <a
                    href={professor.profileSourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 hover:underline inline-flex items-center gap-1"
                  >
                    Faculty Profile / OpenAlex Page
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Research Match & Alignment Progress */}
        {professor.matchReason && (
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Research Alignment: {matchScore}% Matching Shama&apos;s Research
              </p>
              <span className="text-xs font-bold text-emerald-300 font-mono">
                {matchScore}% Match
              </span>
            </div>
            {/* Visual alignment meter */}
            <div className="w-full bg-black/40 rounded-full h-2.5 overflow-hidden border border-white/5">
              <div
                className="bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${matchScore}%` }}
              />
            </div>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">{professor.matchReason}</p>
          </div>
        )}

        {/* Evidence Snippet */}
        {professor.evidenceSnippet && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
              <Quote className="w-3.5 h-3.5 text-indigo-400" />
              Retrieved Page Evidence
            </div>
            <p className="text-xs text-slate-300 italic font-mono bg-black/20 p-2.5 rounded-lg border border-white/5">
              &quot;{professor.evidenceSnippet}&quot;
            </p>
          </div>
        )}

        {/* FUNDING TIMELINE & DEADLINE ALERT BANNER */}
        <div
          className={`rounded-xl p-4 border flex items-start gap-3.5 ${
            timelineInfo.isExpired
              ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
              : timelineInfo.status === 'closing_soon'
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
          }`}
        >
          <Clock
            className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
              timelineInfo.isExpired
                ? 'text-rose-400'
                : timelineInfo.status === 'closing_soon'
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}
          />
          <div className="space-y-1.5 text-xs sm:text-sm flex-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="font-bold text-white text-sm">
                {timelineInfo.bannerTitle}
              </p>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${timelineInfo.badgeClass}`}>
                {timelineInfo.badgeText}
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed text-xs sm:text-sm">
              {timelineInfo.bannerDescription}
            </p>
            {!timelineInfo.isExpired && timelineInfo.formattedDeadline && (
              <div className="bg-black/30 rounded-lg p-2.5 border border-white/5 mt-2">
                <p className="text-amber-300 font-semibold text-xs flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span>Important: Funding terminates strictly on this date. You cannot apply after the deadline passes.</span>
                </p>
              </div>
            )}
            {timelineInfo.isExpired && (
              <div className="bg-rose-950/40 rounded-lg p-2.5 border border-rose-500/20 mt-2">
                <p className="text-rose-300 font-semibold text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                  <span>Funding is closed. Under university policy, no further applications can be accepted.</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* COMPREHENSIVE PhD OPPORTUNITY CAPTURE GRID */}
        <div className="space-y-3 pt-2">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-400" />
            PhD Opportunity Specifications & Official Evidence
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* 1. Funding Amount & Stipend */}
            <div className="glass rounded-xl p-3.5 border border-white/10 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400 uppercase font-semibold">Funding & Stipend</p>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                    FUNDING_CLASSIFICATION_COLORS[professor.fundingClassification || 'fully_funded']
                  }`}
                >
                  {FUNDING_CLASSIFICATION_LABELS[professor.fundingClassification || 'fully_funded']}
                </span>
              </div>
              <p className="text-sm font-semibold text-emerald-300 font-mono">
                {professor.fundingAmount || 'Confirmed Doctoral Funding'}
              </p>
              {professor.stipendDuration && (
                <p className="text-xs text-slate-300">
                  ⏱️ <strong>Duration:</strong> {professor.stipendDuration}
                </p>
              )}
              {professor.fundingSource && (
                <p className="text-xs text-slate-400">
                  Source: {professor.fundingSource}
                </p>
              )}
              {professor.fundingSourceUrl && (
                <a
                  href={professor.fundingSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-emerald-400 hover:underline inline-flex items-center gap-1 pt-1"
                >
                  <ExternalLink className="w-3 h-3" /> View official funding details
                </a>
              )}
            </div>

            {/* 2. Tuition Fee Coverage */}
            <div className="glass rounded-xl p-3.5 border border-white/10 space-y-1.5">
              <p className="text-xs text-slate-400 uppercase font-semibold">Tuition Fee Coverage</p>
              <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-teal-400" />
                {professor.tuitionCoverage === 'full'
                  ? '100% Full Tuition Waiver Included'
                  : professor.tuitionCoverage === 'partial'
                  ? 'Partial Tuition Fee Waiver'
                  : professor.tuitionCoverage === 'none'
                  ? 'No Tuition Coverage (Self-funded tuition)'
                  : 'Tuition Coverage Not Stated'}
              </p>
              <p className="text-xs text-slate-400">
                {professor.tuitionCoverage === 'full'
                  ? 'Full tuition fees are covered by the research grant / university scholarship.'
                  : 'Check the official application guidelines for tuition waiver specifics.'}
              </p>
              {professor.sourceVerifiedDate && (
                <p className="text-[11px] text-slate-500 pt-1">
                  Source verification date: {professor.sourceVerifiedDate}
                </p>
              )}
            </div>

            {/* 3. International Eligibility & Requirements */}
            <div className="glass rounded-xl p-3.5 border border-white/10 space-y-1.5">
              <p className="text-xs text-slate-400 uppercase font-semibold">International Applicant Eligibility</p>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs px-2 py-0.5 rounded font-semibold ${
                    professor.internationalEligibility === 'eligible'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : professor.internationalEligibility === 'home_eu_only'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {professor.internationalEligibility === 'eligible'
                    ? '🌍 Open to International Applicants'
                    : professor.internationalEligibility === 'home_eu_only'
                    ? '⛔ Home / UK / EU Applicants Only'
                    : '❓ Needs International Review'}
                </span>
              </div>
              {professor.eligibilitySnippet && (
                <p className="text-xs text-slate-300 italic bg-black/20 p-2 rounded border border-white/5">
                  &quot;{professor.eligibilitySnippet}&quot;
                </p>
              )}
              {professor.englishRequirements && (
                <p className="text-xs text-teal-300">
                  🗣️ <strong>English Requirements:</strong> {professor.englishRequirements}
                </p>
              )}
            </div>

            {/* 4. Application Deadline, Intake & Portal Links */}
            <div className="glass rounded-xl p-3.5 border border-white/10 space-y-1.5">
              <p className="text-xs text-slate-400 uppercase font-semibold">Deadlines & Application Portal</p>
              <p className="text-sm font-semibold text-white">
                {timelineInfo.formattedDeadline}
              </p>
              {professor.intendedIntake && (
                <p className="text-xs text-indigo-300">
                  📅 <strong>Intended Intake:</strong> {professor.intendedIntake}
                </p>
              )}
              {professor.requiredQualifications && (
                <p className="text-xs text-slate-300">
                  🎓 <strong>Required Qualifications:</strong> {professor.requiredQualifications}
                </p>
              )}
              <div className="flex items-center gap-3 pt-1 flex-wrap">
                {professor.officialApplicationUrl && (
                  <a
                    href={professor.officialApplicationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-purple-400 hover:text-purple-300 font-medium inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Official Application Portal
                  </a>
                )}
                {professor.adUrl && (
                  <a
                    href={professor.adUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-400 hover:underline inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" /> Original Advertisement
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action feedback */}
      {actionError && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm fade-in">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-emerald-300 text-sm fade-in">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {actionSuccess}
        </div>
      )}

      {/* Recipient Email & Evidence Banner */}
      {professor.email && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 text-xs sm:text-sm flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-300">
              Recipient Email: <strong className="font-mono text-emerald-300">{professor.email}</strong>
            </span>
          </div>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${VERIFICATION_COLORS[professor.verificationLevel || 'unverified']}`}>
            {VERIFICATION_LABELS[professor.verificationLevel || 'unverified']}
          </span>
        </div>
      )}

      {/* Email Draft Section */}
      {emailDraft ? (
        <div className="glass rounded-2xl p-6 border border-white/10 space-y-5">
          <div className="flex items-center justify-between gap-4 flex-wrap border-b border-white/5 pb-3">
            <h2 className="text-base font-semibold text-white">Personalized Email Draft</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {emailDraft.type === 'first' ? 'First Contact' : '7-Day Follow-Up'}
            </span>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Subject</label>
            <input
              type="text"
              value={editedSubject}
              onChange={(e) => setEditedSubject(e.target.value)}
              disabled={alreadySent}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Body</label>
            <textarea
              value={editedBody}
              onChange={(e) => setEditedBody(e.target.value)}
              disabled={alreadySent}
              rows={12}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none disabled:opacity-60 disabled:cursor-not-allowed font-mono leading-relaxed"
            />
            {!alreadySent && (
              <p className="text-slate-500 text-xs mt-1">
                {editedBody.split(' ').filter(Boolean).length} words (target ≤ 150)
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              {canSend && professor.email && (
                <button
                  id="send-email-btn"
                  onClick={handleSend}
                  disabled={sending || regenerating}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50 shadow-lg shadow-emerald-500/20 hover:brightness-110 transition-all cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>
                    {sending ? 'Sending via Gmail…' : `✉️ Send via Gmail (${professor.email})`}
                  </span>
                </button>
              )}
              {!alreadySent && (
                <button
                  id="regenerate-email-btn"
                  onClick={handleRegenerate}
                  disabled={sending || regenerating}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-white text-xs sm:text-sm font-medium glass border border-white/10 hover:bg-white/10 disabled:opacity-50 transition-colors"
                >
                  {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {regenerating ? 'Regenerating…' : 'Regenerate'}
                </button>
              )}
              <button
                id="delete-professor-btn"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-red-400 text-xs sm:text-sm font-medium border border-red-500/20 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>

            {canSend && professor.email && (
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>
                  Dispatches immediately from <strong className="text-white">shamaabidiphd@gmail.com</strong> to <strong className="text-white font-mono">{professor.email}</strong>. Status will update to &apos;Sent&apos;.
                </span>
              </p>
            )}

            {alreadySent && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-2.5 text-blue-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span>
                  Email sent from <strong>shamaabidiphd@gmail.com</strong> to <strong className="font-mono">{professor.email}</strong>. 7-Day Follow-Up tracking is active.
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="glass rounded-2xl p-6 text-center space-y-4 border border-white/10">
          <p className="text-slate-400 text-sm">
            {professor.status === 'email_not_found'
              ? 'No verified email address found on official university domain for this candidate.'
              : 'No email draft generated yet.'}
          </p>
          {professor.email && (
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="px-5 py-2.5 rounded-xl text-white text-sm font-medium bg-indigo-600 hover:bg-indigo-500 inline-flex items-center gap-2"
            >
              {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate Draft Email
            </button>
          )}
        </div>
      )}
    </div>
  );
}
