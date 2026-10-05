'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { GraduationCap, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { signIn, signInWithGoogle, user, loading, error } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    if (!email.trim() || !password) {
      setLocalError('Please enter both email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      router.push('/dashboard');
    } catch {
      // error is shown via context
    } finally {
      setSubmitting(false);
    }
  };

  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const handleGoogleSignIn = async () => {
    setLocalError('');
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
      router.push('/dashboard');
    } catch {
      // error is shown via context
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f1e] relative overflow-hidden py-8 px-4 sm:px-6">
      {/* Ambient background blobs */}
      <div
        className="absolute top-[-20%] left-[-10%] w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-[-20%] right-[-10%] w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] rounded-full opacity-15 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)' }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo / branding */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl mb-3 sm:mb-4 glass">
            <GraduationCap className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-400" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold gradient-text mb-1">PhDReach</h1>
          <p className="text-slate-400 text-xs sm:text-sm">
            Private PhD Outreach CRM · Dr. Shama Abidi
          </p>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-6 sm:p-8 shadow-2xl border border-white/10">
          <h2 className="text-lg sm:text-xl font-semibold text-white mb-5">Sign in to continue</h2>

          {/* Continue with Google Button */}
          <button
            id="google-signin-btn"
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleSubmitting || submitting}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-medium text-white bg-white/10 hover:bg-white/15 border border-white/15 transition-all text-sm mb-5 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {googleSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                Connecting with Google…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Continue with Google
              </>
            )}
          </button>

          {/* Divider */}
          <div className="relative flex items-center justify-center mb-5">
            <div className="border-t border-white/10 w-full" />
            <span className="bg-[#0f172a] px-3 text-xs uppercase tracking-wider text-slate-500 absolute">
              or with email
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="shamaabidiphd@gmail.com"
                  autoComplete="email"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 sm:py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-xs sm:text-sm font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-12 py-2.5 sm:py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {displayError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 text-red-300 text-xs sm:text-sm fade-in">
                {displayError}
              </div>
            )}

            {/* Submit */}
            <button
              id="login-submit-btn"
              type="submit"
              disabled={submitting || googleSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                boxShadow: '0 4px 24px rgba(99,102,241,0.3)',
              }}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          This is a private system. Unauthorized access is prohibited.
        </p>
      </div>
    </div>
  );
}
