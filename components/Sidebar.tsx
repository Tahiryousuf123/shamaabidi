'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  GraduationCap,
  LayoutDashboard,
  Search,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/find', label: 'Find Professors', icon: Search },
  { href: '/professors', label: 'All Professors', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const { signOut, user } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavContent = () => (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-6 border-b border-white/5">
        <div className="w-9 h-9 rounded-xl glass flex items-center justify-center flex-shrink-0">
          <GraduationCap className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <p className="font-bold text-white text-sm leading-tight">PhDReach</p>
          <p className="text-slate-500 text-xs leading-tight">Outreach CRM</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-indigo-400' : ''}`} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="px-3 py-4 border-t border-white/5">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">SA</span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-medium truncate">Shama Abidi</p>
            <p className="text-slate-500 text-xs truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 glass border-b border-white/5 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-indigo-400" />
          <span className="font-bold text-white text-sm">PhDReach</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-slate-400 hover:text-white p-1"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`lg:hidden fixed top-0 left-0 h-full w-64 z-40 flex flex-col transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: '#0d1424', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        <NavContent />
      </div>

      {/* Desktop sidebar */}
      <div
        className="hidden lg:flex flex-col w-60 flex-shrink-0 h-screen sticky top-0"
        style={{ background: '#0d1424', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        <NavContent />
      </div>
    </>
  );
}
