'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminShowDto, SalesReportDto } from '@ticketing/shared';
import { fetchAdminShows, fetchSalesReport } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDateTime, formatPrice } from '@/lib/format';

const ADMIN_ROLES = ['SUPER_ADMIN', 'VENUE_MANAGER'];

export default function AdminPage() {
  const { user, ready, authedFetch } = useAuth();
  const [shows, setShows] = useState<AdminShowDto[] | null>(null);
  const [sales, setSales] = useState<SalesReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);

  useEffect(() => {
    if (!ready || !isAdmin) return;
    Promise.all([fetchAdminShows(authedFetch), fetchSalesReport(authedFetch)])
      .then(([s, r]) => {
        setShows(s);
        setSales(r);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [ready, isAdmin, authedFetch]);

  if (!ready) return <p className="text-neutral-400">Loading…</p>;
  if (!user)
    return (
      <p className="text-neutral-300">
        Please{' '}
        <Link href="/login?next=/admin" className="text-violet-400 hover:underline">
          login
        </Link>{' '}
        as an admin.
      </p>
    );
  if (!isAdmin) return <p className="text-red-400">You don&apos;t have admin access.</p>;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Admin dashboard</h1>
      {error && <p className="text-red-400">{error}</p>}

      {/* Sales summary */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Revenue (confirmed)" value={sales ? formatPrice(sales.revenue) : '—'} />
        <StatCard label="Confirmed orders" value={sales ? String(sales.confirmedOrders) : '—'} />
        <StatCard label="Seats sold" value={sales ? String(sales.seatsSold) : '—'} />
      </section>

      {/* Shows */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Shows</h2>
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-900/60 text-neutral-400">
              <tr>
                <th className="px-4 py-2">Event</th>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Hall</th>
                <th className="px-4 py-2">Occupancy</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {shows?.map((s) => (
                <tr key={s.showId} className="border-t border-neutral-800">
                  <td className="px-4 py-2 font-medium">{s.eventTitle}</td>
                  <td className="px-4 py-2 text-neutral-400">{formatDateTime(s.startsAt)}</td>
                  <td className="px-4 py-2 text-neutral-400">{s.hallName}</td>
                  <td className="px-4 py-2">
                    {s.occupancy.booked}/{s.occupancy.total} booked · {s.occupancy.blocked} blocked
                    <span className="ml-2 text-neutral-500">({s.occupancy.occupancyPct}%)</span>
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/admin/shows/${s.showId}`}
                      className="text-violet-400 hover:underline"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
              {shows && shows.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-neutral-500" colSpan={5}>
                    No shows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
