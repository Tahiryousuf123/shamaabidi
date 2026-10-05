import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0f1e] text-white px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400 font-bold text-2xl">
          404
        </div>
        <h1 className="text-2xl font-bold text-slate-100">Page Not Found</h1>
        <p className="text-slate-400 text-sm">
          The requested page could not be found. Please return to the dashboard or login screen.
        </p>
        <div className="flex justify-center gap-3">
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/login"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
          >
            Login
          </Link>
        </div>
      </div>
    </div>
  );
}
