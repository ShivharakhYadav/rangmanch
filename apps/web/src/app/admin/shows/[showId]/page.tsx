'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminOrderDto, OccupancyDto } from '@ticketing/shared';
import {
  adminBlockSeats,
  adminCancelOrder,
  adminListOrders,
  adminUnblockSeats,
  fetchOccupancy,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatPrice } from '@/lib/format';

const ADMIN_ROLES = ['SUPER_ADMIN', 'VENUE_MANAGER'];
const CANCELLABLE = ['CONFIRMED', 'PENDING'];

export default function AdminShowPage({ params }: { params: Promise<{ showId: string }> }) {
  const { showId } = use(params);
  const { user, ready, authedFetch } = useAuth();
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);

  const [occ, setOcc] = useState<OccupancyDto | null>(null);
  const [orders, setOrders] = useState<AdminOrderDto[] | null>(null);
  const [seatInput, setSeatInput] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [o, ords] = await Promise.all([
      fetchOccupancy(authedFetch, showId),
      adminListOrders(authedFetch, showId),
    ]);
    setOcc(o);
    setOrders(ords);
  }, [authedFetch, showId]);

  useEffect(() => {
    if (ready && isAdmin) refresh().catch((e) => setMsg(e instanceof Error ? e.message : 'Failed'));
  }, [ready, isAdmin, refresh]);

  const parseSeats = () =>
    seatInput
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

  async function seatAction(block: boolean) {
    const seats = parseSeats();
    if (!seats.length) return;
    setBusy(true);
    setMsg(null);
    try {
      if (block) await adminBlockSeats(authedFetch, showId, seats);
      else await adminUnblockSeats(authedFetch, showId, seats);
      setSeatInput('');
      await refresh();
      setMsg(`${block ? 'Blocked' : 'Unblocked'}: ${seats.join(', ')}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      await adminCancelOrder(authedFetch, id);
      await refresh();
      setMsg('Order cancelled and refunded.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <p className="text-neutral-400">Loading…</p>;
  if (!isAdmin) return <p className="text-red-400">You don&apos;t have admin access.</p>;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin" className="text-sm text-violet-400 hover:underline">
        ← Back to dashboard
      </Link>
      <h1 className="text-2xl font-bold">Manage show</h1>

      {/* Occupancy */}
      {occ && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Total" value={occ.total} />
          <Stat label="Booked" value={occ.booked} accent="text-green-400" />
          <Stat label="Blocked" value={occ.blocked} accent="text-amber-400" />
          <Stat label="Available" value={occ.available} />
        </div>
      )}

      {/* Offline block/unblock */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="mb-2 font-semibold">Offline seat blocking</h2>
        <p className="mb-3 text-sm text-neutral-400">
          Enter seat refs (comma-separated), e.g. <code className="text-neutral-300">A3, A4, B1</code>
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={seatInput}
            onChange={(e) => setSeatInput(e.target.value)}
            placeholder="A3, A4"
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 outline-none focus:border-violet-500"
          />
          <button
            type="button"
            onClick={() => seatAction(true)}
            disabled={busy}
            className="rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-500 disabled:opacity-50"
          >
            Block
          </button>
          <button
            type="button"
            onClick={() => seatAction(false)}
            disabled={busy}
            className="rounded-lg border border-neutral-700 px-4 py-2 hover:bg-neutral-800 disabled:opacity-50"
          >
            Unblock
          </button>
        </div>
        {msg && <p className="mt-3 text-sm text-neutral-300">{msg}</p>}
      </section>

      {/* Orders */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Orders</h2>
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-900/60 text-neutral-400">
              <tr>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Seats</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Ref</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {orders?.map((o) => (
                <tr key={o.id} className="border-t border-neutral-800">
                  <td className="px-4 py-2">{o.userName ?? o.userPhone}</td>
                  <td className="px-4 py-2">{o.seatRefs.join(', ')}</td>
                  <td className="px-4 py-2">{formatPrice(o.amount)}</td>
                  <td className="px-4 py-2">{o.status}</td>
                  <td className="px-4 py-2 font-mono text-xs text-neutral-500">
                    {o.referenceNo ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    {CANCELLABLE.includes(o.status) && (
                      <button
                        type="button"
                        onClick={() => cancel(o.id)}
                        disabled={busy}
                        className="text-red-400 hover:underline disabled:opacity-50"
                      >
                        Cancel &amp; refund
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {orders && orders.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-neutral-500" colSpan={6}>
                    No orders for this show.
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

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ?? ''}`}>{value}</div>
    </div>
  );
}
