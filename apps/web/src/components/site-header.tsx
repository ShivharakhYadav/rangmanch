'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/events', label: 'Events' },
  { href: '/about', label: 'About Us' },
  { href: '/contact', label: 'Contact Us' },
  { href: '/profile', label: 'My Profile' },
];

const ADMIN_ROLES = ['SUPER_ADMIN', 'VENUE_MANAGER'];

export function SiteHeader() {
  const { user, ready, logout } = useAuth();
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          🎟️ <span className="text-violet-400">Rangmanch</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm text-neutral-300">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-white">
              {item.label}
            </Link>
          ))}
          {isAdmin && (
            <Link href="/admin" className="text-amber-400 hover:text-amber-300">
              Admin
            </Link>
          )}
          {ready &&
            (user ? (
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
              >
                {user.name ?? user.phone} · Logout
              </button>
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500"
              >
                Login
              </Link>
            ))}
        </nav>
      </div>
    </header>
  );
}
