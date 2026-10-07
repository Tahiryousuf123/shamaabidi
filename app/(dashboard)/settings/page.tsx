'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { UserProfile, DEFAULT_PROFILE, GLOBAL_TARGET_REGIONS, ALL_GLOBAL_COUNTRIES } from '@/lib/types';
import {
  Settings as SettingsIcon,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Upload,
  X,
  Plus,
  Play,
  RotateCw,
  Compass,
  FileText,
  Sparkles,
  Globe,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [cvFile, setCvFile] = useState<File | null>(null);

  // Auto-find list editors state
  const [newTopic, setNewTopic] = useState('');
  const [newCountry, setNewCountry] = useState('');

  // Manual Auto-Find test trigger state
  const [runningBatch, setRunningBatch] = useState(false);
  const [batchResult, setBatchResult] = useState<any>(null);

  // Region accordion state
  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({
    north_america: true,
    oceania: true,
    western_northern_europe: true,
    southern_europe: false,
    central_eastern_europe: false,
    euro_asian_boundary: false,
    global_expansion: false,
  });

  const toggleRegionExpanded = (id: string) => {
    setExpandedRegions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleCountry = (country: string) => {
    setProfile((p) => {
      const exists = p.countries.includes(country);
      return {
        ...p,
        countries: exists ? p.countries.filter((c) => c !== country) : [...p.countries, country],
      };
    });
  };

  const handleSelectRegion = (regionId: string) => {
    const group = GLOBAL_TARGET_REGIONS.find((r) => r.id === regionId);
    if (!group) return;
    setProfile((p) => {
      const set = new Set([...p.countries, ...group.countries]);
      return { ...p, countries: Array.from(set) };
    });
  };

  const handleDeselectRegion = (regionId: string) => {
    const group = GLOBAL_TARGET_REGIONS.find((r) => r.id === regionId);
    if (!group) return;
    const toRemove = new Set(group.countries);
    setProfile((p) => ({
      ...p,
      countries: p.countries.filter((c) => !toRemove.has(c)),
    }));
  };

  const handleSelectAllGlobal = () => {
    setProfile((p) => {
      const set = new Set([...p.countries, ...ALL_GLOBAL_COUNTRIES]);
      return { ...p, countries: Array.from(set) };
    });
  };

  const handleDeselectAllCountries = () => {
    setProfile((p) => ({ ...p, countries: [] }));
  };

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'profile', 'main'));
        if (snap.exists()) {
          const data = snap.data();
          setProfile({
            ...DEFAULT_PROFILE,
            ...data,
            dailyFindTarget: data.dailyFindTarget ?? DEFAULT_PROFILE.dailyFindTarget,
            topics: data.topics?.length ? data.topics : DEFAULT_PROFILE.topics,
            countries: data.countries?.length ? data.countries : DEFAULT_PROFILE.countries,
            publications: data.publications ?? DEFAULT_PROFILE.publications,
          } as UserProfile);
        } else {
          // Seed default profile
          await setDoc(doc(db, 'profile', 'main'), {
            ...DEFAULT_PROFILE,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updateData: Partial<UserProfile> = {
        ...profile,
        updatedAt: new Date(),
      };

      // Handle CV upload if present
      if (cvFile) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(cvFile);
        });
        updateData.cvBase64 = base64;
        updateData.cvFileName = cvFile.name;
      }

      await setDoc(doc(db, 'profile', 'main'), updateData, { merge: true });
      setSuccess('Profile & outreach settings saved successfully!');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError('Failed to save settings. Please try again.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCvRemove = async () => {
    setCvFile(null);
    try {
      await setDoc(
        doc(db, 'profile', 'main'),
        { cvBase64: null, cvFileName: null },
        { merge: true }
      );
      setProfile((p) => ({ ...p, cvBase64: undefined, cvFileName: undefined }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddTopic = () => {
    if (!newTopic.trim()) return;
    if (profile.topics.includes(newTopic.trim())) {
      setNewTopic('');
      return;
    }
    setProfile((p) => ({ ...p, topics: [...p.topics, newTopic.trim()] }));
    setNewTopic('');
  };

  const handleRemoveTopic = (topicToRemove: string) => {
    setProfile((p) => ({
      ...p,
      topics: p.topics.filter((t) => t !== topicToRemove),
    }));
  };

  const handleAddCountry = () => {
    if (!newCountry.trim()) return;
    if (profile.countries.includes(newCountry.trim())) {
      setNewCountry('');
      return;
    }
    setProfile((p) => ({ ...p, countries: [...p.countries, newCountry.trim()] }));
    setNewCountry('');
  };

  const handleRemoveCountry = (countryToRemove: string) => {
    setProfile((p) => ({
      ...p,
      countries: p.countries.filter((c) => c !== countryToRemove),
    }));
  };

  const handleResetDefaults = () => {
    setProfile((p) => ({
      ...p,
      dailyFindTarget: DEFAULT_PROFILE.dailyFindTarget,
      topics: [...DEFAULT_PROFILE.topics],
      countries: [...DEFAULT_PROFILE.countries],
    }));
  };

  const handleRunManualBatch = async () => {
    setRunningBatch(true);
    setBatchResult(null);
    setError('');
    try {
      // First save current settings so backend uses current topics/countries
      await setDoc(
        doc(db, 'profile', 'main'),
        {
          dailyFindTarget: profile.dailyFindTarget,
          topics: profile.topics,
          countries: profile.countries,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      // Trigger cron/find with user token or secret
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
        throw new Error(data.error || 'Auto-find batch execution failed');
      }
      setBatchResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch execution failed');
    } finally {
      setRunningBatch(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
      </div>
    );
  }

  const combinationCount = (profile.topics?.length || 0) * (profile.countries?.length || 0);

  return (
    <div className="space-y-8 max-w-3xl pb-16">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings & Outreach Configuration</h1>
        <p className="text-slate-400 text-sm mt-1">
          Configure daily auto-find parameters, search rotation topics, countries, and profile details for Dr. Shama Abidi.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {/* Daily Auto-Find Job Configuration */}
        {/* Shama's Verified Research Basis */}
        <div className="glass rounded-2xl p-6 space-y-5 border border-white/10">
          <div className="border-b border-white/5 pb-3">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Search Basis: Dr. Shama Abidi's Research Profile
            </h2>
            <p className="text-slate-400 text-xs mt-1">
              OpenAlex queries are automatically generated and ranked using your 5 peer-reviewed publications and 8 clinical practice themes.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-2">
                5 Primary Publications (Citation & Concept Matching)
              </p>
              <div className="space-y-2">
                {[
                  'Effectiveness and safety assessment of calcium channel blockers compared to beta blockers in patients with angina',
                  'Evaluation of carbapenem antimicrobial stewardship program at a tertiary care hospital',
                  'AI meets human expertise: clinical pharmacist interventions vs artificial intelligence at a tertiary care hospital',
                  'Evaluating knowledge of high-alert medications among nurses, pharmacists and clinicians',
                  'Evidence based pharmacy practice in Pakistan: knowledge, attitudes and implementation barriers',
                ].map((paper, idx) => (
                  <div key={idx} className="bg-white/5 border border-white/5 rounded-xl px-3.5 py-2 text-xs text-slate-300 flex items-start gap-2">
                    <span className="text-indigo-400 font-bold">{idx + 1}.</span>
                    <span>"{paper}"</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-purple-300 uppercase tracking-wider mb-2">
                8 Research & Practice Themes (Candidate Ranking Weights)
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  'clinical pharmacy',
                  'medication safety',
                  'high-alert medications',
                  'antimicrobial stewardship and resistance',
                  'evidence-based pharmacy practice',
                  'implementation science',
                  'hospital pharmacy services',
                  'AI/digital clinical decision support',
                ].map((theme) => (
                  <span
                    key={theme}
                    className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-500/15 text-purple-200 border border-purple-500/30"
                  >
                    🎯 {theme}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Auto-Find Configuration Card */}
        <div className="glass rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Compass className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Daily Auto-Find Job Settings</h2>
                <p className="text-slate-400 text-xs">
                  Runs daily via Vercel Cron (<code className="text-indigo-300">/api/cron/find</code>) in batches of 5 professors.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetDefaults}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-500/30 hover:bg-indigo-500/10 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Reset Defaults
            </button>
          </div>

          {/* Daily Find Target */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Daily Find Target (1–50)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={profile.dailyFindTarget ?? 50}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, dailyFindTarget: Math.min(100, Math.max(1, Number(e.target.value))) }))
                  }
                  className="w-32 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
                <span className="text-slate-400 text-xs">professors per day (recommended: 50)</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Daily Email Send Limit
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={profile.dailySendLimit ?? 50}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, dailySendLimit: Math.max(1, Number(e.target.value)) }))
                  }
                  className="w-32 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
                <span className="text-slate-400 text-xs">max emails sent daily (recommended: 50)</span>
              </div>
            </div>
          </div>

          {/* Rotation info */}
          <div className="bg-white/5 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-300">Topic × Country Rotation Pool</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {profile.topics?.length || 0} topics × {profile.countries?.length || 0} countries ={' '}
                <strong className="text-indigo-300">{combinationCount} unique combinations</strong>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Fair Rotation Active
              </span>
            </div>
          </div>

          {/* Topics List Editor */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Research Topics ({profile.topics?.length || 0})
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTopic();
                  }
                }}
                placeholder="e.g. antimicrobial stewardship clinical pharmacy"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleAddTopic}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Add Topic
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.topics?.map((topic) => (
                <span
                  key={topic}
                  className="inline-flex items-center gap-1.5 bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 text-xs px-3 py-1.5 rounded-lg"
                >
                  {topic}
                  <button
                    type="button"
                    onClick={() => handleRemoveTopic(topic)}
                    className="hover:text-red-400 transition-colors ml-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Target Countries & Global Regions Configuration */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
              <div>
                <label className="block text-sm font-semibold text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-purple-400" />
                  Target Countries & Global Search Regions ({profile.countries?.length || 0} active)
                </label>
                <p className="text-slate-400 text-xs mt-0.5">
                  Dynamic global outreach covers 7 regions (~70 countries). Fully configurable on-the-fly without rebuilding the system.
                </p>
              </div>

              {/* Bulk actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleSelectAllGlobal}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-purple-600/20 text-purple-300 border border-purple-500/30 hover:bg-purple-600/30 transition-colors font-medium"
                >
                  Select All 7 Regions
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllCountries}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-white/5 text-slate-400 border border-white/10 hover:text-white transition-colors font-medium"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Custom Country Add Input */}
            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-3 space-y-2">
              <label className="text-xs font-medium text-slate-300">
                Add Any Custom Country (Immediately active in rotation):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCountry}
                  onChange={(e) => setNewCountry(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCountry();
                    }
                  }}
                  placeholder="e.g. Chile, Brazil, Luxembourg, etc."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="button"
                  onClick={handleAddCountry}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Country
                </button>
              </div>
            </div>

            {/* 7 Target Regions Cards / Accordions */}
            <div className="space-y-3">
              {GLOBAL_TARGET_REGIONS.map((grp) => {
                const isExpanded = expandedRegions[grp.id] ?? false;
                const selectedInGroup = grp.countries.filter((c) => profile.countries.includes(c));
                const allSelected = selectedInGroup.length === grp.countries.length;
                const someSelected = selectedInGroup.length > 0 && !allSelected;

                return (
                  <div
                    key={grp.id}
                    className="border border-white/10 rounded-xl bg-white/[0.02] overflow-hidden transition-colors"
                  >
                    {/* Header */}
                    <div
                      onClick={() => toggleRegionExpanded(grp.id)}
                      className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.03] transition-colors select-none"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-purple-400 font-bold text-xs">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-white truncate">
                              {grp.region}
                            </span>
                            <span
                              className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                allSelected
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : someSelected
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-slate-500/20 text-slate-400 border border-slate-500/20'
                              }`}
                            >
                              {selectedInGroup.length} / {grp.countries.length} active
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {grp.description}
                          </p>
                        </div>
                      </div>

                      {/* Region quick toggle buttons */}
                      <div
                        className="flex items-center gap-1.5 flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectRegion(grp.id)}
                          className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-purple-600/30 text-purple-300 border border-white/10 transition-colors"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeselectRegion(grp.id)}
                          className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* Country Pills (Collapsible) */}
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-1 border-t border-white/5 bg-black/10">
                        <div className="flex flex-wrap gap-1.5 pt-2">
                          {grp.countries.map((c) => {
                            const active = profile.countries.includes(c);
                            return (
                              <button
                                key={c}
                                type="button"
                                onClick={() => toggleCountry(c)}
                                className={`text-xs px-2.5 py-1 rounded-lg border transition-all inline-flex items-center gap-1.5 ${
                                  active
                                    ? 'bg-purple-600/25 text-purple-200 border-purple-500/50 shadow-sm shadow-purple-500/10'
                                    : 'bg-white/[0.03] text-slate-400 border-white/5 hover:text-slate-200 hover:bg-white/[0.06]'
                                }`}
                              >
                                {active ? (
                                  <Check className="w-3 h-3 text-purple-300 flex-shrink-0" />
                                ) : (
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600 flex-shrink-0" />
                                )}
                                <span>{c}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Custom/External Countries not in predefined 7 regions */}
            {(() => {
              const standardSet = new Set(ALL_GLOBAL_COUNTRIES);
              const customOnly = profile.countries.filter((c) => !standardSet.has(c));
              if (customOnly.length === 0) return null;

              return (
                <div className="border border-indigo-500/20 rounded-xl bg-indigo-500/5 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
                      Custom Added Countries ({customOnly.length})
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {customOnly.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1.5 bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 text-xs px-3 py-1.5 rounded-lg"
                      >
                        {c}
                        <button
                          type="button"
                          onClick={() => handleRemoveCountry(c)}
                          className="hover:text-red-400 transition-colors ml-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Manual Run Test Action */}
          <div className="border-t border-white/5 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">Manual Auto-Find Trigger</p>
              <p className="text-xs text-slate-400">
                Execute a single batch of 5 professors right now to verify OpenAlex, Tavily literal email lookup, and AI draft generation.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunManualBatch}
              disabled={runningBatch}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors"
            >
              {runningBatch ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Running Batch…
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Run Batch Now (5 Profs)
                </>
              )}
            </button>
          </div>

          {batchResult && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-xs text-emerald-300 space-y-1 fade-in">
              <div className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Batch Run Completed
              </div>
              <div>
                Topic: <strong className="text-white">{batchResult.combination?.topic}</strong> | Country: <strong className="text-white">{batchResult.combination?.country}</strong>
              </div>
              <div>
                Added with Email: <strong className="text-white">{batchResult.addedWithEmail ?? 0}</strong> | No Email Found: <strong className="text-white">{batchResult.addedWithoutEmail ?? 0}</strong> | Today's Total: <strong className="text-white">{batchResult.todayFound ?? 0} / {batchResult.dailyTarget ?? 30}</strong>
              </div>
              {batchResult.quotaError && (
                <div className="text-amber-400 mt-1">Quota Warning: {batchResult.quotaError}</div>
              )}
            </div>
          )}
        </div>

        {/* Profile card with Dr. Shama Abidi credentials */}
        <div className="glass rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <SettingsIcon className="w-4 h-4 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Academic & Research Profile</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name</label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email Address</label>
              <input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
              <p className="text-slate-500 text-xs mt-1">Gmail used for SMTP & IMAP.</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Research Interests
            </label>
            <textarea
              value={profile.researchInterests}
              onChange={(e) => setProfile((p) => ({ ...p, researchInterests: e.target.value }))}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"
              placeholder="e.g. Antimicrobial stewardship, clinical pharmacy, medication safety..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Professional Background & Experience
            </label>
            <textarea
              value={profile.background}
              onChange={(e) => setProfile((p) => ({ ...p, background: e.target.value }))}
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"
              placeholder="Describe your qualifications, hospital roles, supervisor..."
            />
            <p className="text-slate-500 text-xs mt-1">
              Included in AI prompts to personalize every email inquiry with your specific clinical background.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Peer-Reviewed Publications & Research
            </label>
            <textarea
              value={profile.publications || ''}
              onChange={(e) => setProfile((p) => ({ ...p, publications: e.target.value }))}
              rows={5}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono text-xs resize-none"
              placeholder="List your publications, journals, and conference abstracts..."
            />
          </div>

          {/* CV upload */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              CV Attachment <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            {profile.cvFileName ? (
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <FileText className="w-5 h-5 text-indigo-400" />
                <div className="flex-1 text-sm text-slate-300 font-medium">{profile.cvFileName}</div>
                <button
                  type="button"
                  onClick={handleCvRemove}
                  className="text-red-400 hover:text-red-300 p-1 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-3 bg-white/5 border border-dashed border-white/20 rounded-xl px-4 py-3 cursor-pointer hover:border-indigo-500/50 transition-colors">
                <Upload className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-400">
                  {cvFile ? cvFile.name : 'Upload Dr. Shama Abidi CV (PDF)'}
                </span>
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
            <p className="text-slate-500 text-xs mt-1.5">
              When attached, this CV PDF will be sent alongside outgoing outreach emails.
            </p>
          </div>
        </div>

        {/* Feedback alerts */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-emerald-300 text-sm fade-in">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            {success}
          </div>
        )}

        <button
          id="save-settings-btn"
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-7 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-all shadow-lg hover:brightness-110"
          style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save All Settings'}
        </button>
      </form>
    </div>
  );
}
