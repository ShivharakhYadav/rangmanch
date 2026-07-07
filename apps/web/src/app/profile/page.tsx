'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OrderStatus, type OrderSummaryDto } from '@ticketing/shared';
import { fetchMyOrders } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDateTime, formatPrice } from '@/lib/format';

const STATUS_STYLE: Record<OrderStatus, string> = {
  CONFIRMED: 'text-green-300',
  PENDING: 'text-amber-300',
  CANCELLED: 'text-red-300',
  EXPIRED: 'text-neutral-500',
};

export default function ProfilePage() {
  const { user, token, ready } = useAuth();
  const [orders, setOrders] = useState<OrderSummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setOrders([]);
      return;
    }
    fetchMyOrders(token)
      .then(setOrders)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load bookings'));
  }, [ready, token]);

  if (!ready) return <p className="text-neutral-400">Loading…</p>;

  if (!user) {
    return (
      <div className="max-w-md">
        <h1 className="mb-3 text-2xl font-bold">My Profile</h1>
        <p className="text-neutral-300">
          Please{' '}
          <Link href="/login?next=/profile" className="text-violet-400 hover:underline">
            login
          </Link>{' '}
          to see your booking history.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold">My Profile</h1>
      <p className="mb-6 text-neutral-400">
        {user.name ? `${user.name} · ` : ''}
        {user.phone}
      </p>

      <h2 className="mb-3 text-lg font-semibold">Booking history</h2>
      {error && <p className="text-red-400">{error}</p>}
      {orders === null && !error && <p className="text-neutral-400">Loading bookings…</p>}
      {orders && orders.length === 0 && (
        <p className="text-neutral-500">No bookings yet. Browse events to get started.</p>
      )}

      <div className="flex flex-col gap-3">
        {orders?.map((o) => (
          <div
            key={o.id}
            className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3"
          >
            <div>
              <div className="font-medium">{o.eventTitle}</div>
              <div className="text-sm text-neutral-400">
                {formatDateTime(o.startsAt)} · Seats {o.seatRefs.join(', ')}
              </div>
              {o.referenceNo && (
                <div className="mt-0.5 font-mono text-xs text-neutral-500">{o.referenceNo}</div>
              )}
            </div>
            <div className="text-right">
              <div className="font-medium">{formatPrice(o.amount)}</div>
              <div className={`text-xs font-medium ${STATUS_STYLE[o.status]}`}>{o.status}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
