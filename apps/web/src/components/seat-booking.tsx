'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';
import {
  SeatStatus,
  type SeatMapDto,
  type SeatMapSeatDto,
  type SeatUpdateEvent,
} from '@ticketing/shared';
import {
  API_BASE_URL,
  createHold,
  createOrder,
  fetchMyOrders,
  fetchSeatMap,
  mockPay,
  releaseHold,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDateTime, formatPrice } from '@/lib/format';

type Phase = 'selecting' | 'held' | 'booked';

const MAX_SELECT = 10;

export function SeatBooking({ showId }: { showId: string }) {
  const router = useRouter();
  const { token } = useAuth();
  const [map, setMap] = useState<SeatMapDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<Phase>('selecting');
  const [holdToken, setHoldToken] = useState<string | null>(null);
  const [heldSeats, setHeldSeats] = useState<string[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bookingRef, setBookingRef] = useState<string | null>(null);
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const idempotencyRef = useRef<string>('');

  // Refs so socket/timer callbacks and cleanup see current values.
  const holdTokenRef = useRef<string | null>(null);
  const heldSeatsRef = useRef<string[]>([]);
  holdTokenRef.current = holdToken;
  heldSeatsRef.current = heldSeats;

  const load = useCallback(async () => {
    try {
      setMap(await fetchSeatMap(showId));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load seat map');
    }
  }, [showId]);

  // Initial load + live socket subscription.
  useEffect(() => {
    void load();
    const socket: Socket = io(API_BASE_URL, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => socket.emit('subscribe', { showId }));
    socket.on('seat:update', (evt: SeatUpdateEvent) => {
      if (evt.showId !== showId) return;
      setMap((prev) => {
        if (!prev) return prev;
        const mine = new Set(heldSeatsRef.current);
        const seats = prev.seats.map((s) => {
          if (!evt.seatRefs.includes(s.seatRef)) return s;
          if (mine.has(s.seatRef)) return s; // don't override my own held seats
          return { ...s, status: evt.status };
        });
        return { ...prev, seats };
      });
    });
    return () => {
      socket.disconnect();
    };
  }, [showId, load]);

  // Countdown while holding.
  useEffect(() => {
    if (phase !== 'held') return;
    const tick = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(tick);
          // Hold expired server-side; reset and refresh.
          setPhase('selecting');
          setHoldToken(null);
          setHeldSeats([]);
          setActionError('Your hold expired. Please select seats again.');
          void load();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [phase, load]);

  // Best-effort release if the user leaves mid-hold.
  useEffect(() => {
    const releaseOnLeave = () => {
      if (holdTokenRef.current && heldSeatsRef.current.length) {
        void releaseHold(showId, holdTokenRef.current, heldSeatsRef.current);
      }
    };
    window.addEventListener('beforeunload', releaseOnLeave);
    return () => {
      window.removeEventListener('beforeunload', releaseOnLeave);
      releaseOnLeave();
    };
  }, [showId]);

  const rows = useMemo(() => groupRows(map?.seats ?? []), [map]);
  const selectedList = useMemo(() => [...selected], [selected]);
  const totalPaise = useMemo(() => {
    if (!map) return 0;
    const refs = phase === 'held' ? heldSeats : selectedList;
    const set = new Set(refs);
    return map.seats.filter((s) => set.has(s.seatRef)).reduce((sum, s) => sum + s.price, 0);
  }, [map, selectedList, heldSeats, phase]);

  function toggleSeat(seat: SeatMapSeatDto) {
    if (phase !== 'selecting' || seat.status !== SeatStatus.Available) return;
    setActionError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seat.seatRef)) next.delete(seat.seatRef);
      else if (next.size < MAX_SELECT) next.add(seat.seatRef);
      else setActionError(`You can select up to ${MAX_SELECT} seats.`);
      return next;
    });
  }

  async function onHold() {
    if (selected.size === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      const refs = [...selected];
      const result = await createHold(showId, refs);
      setHoldToken(result.holdToken);
      setHeldSeats(refs);
      setSelected(new Set());
      idempotencyRef.current = crypto.randomUUID();
      setSecondsLeft(Math.max(1, Math.ceil((new Date(result.expiresAt).getTime() - Date.now()) / 1000)));
      setPhase('held');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not hold seats');
      void load();
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!holdToken) return;
    // Login required before purchase (SRS). Send them to login and back.
    if (!token) {
      router.push(`/login?next=${encodeURIComponent(`/shows/${showId}`)}`);
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const order = await createOrder(token, {
        showId,
        holdToken,
        seatRefs: heldSeats,
        idempotencyKey: idempotencyRef.current,
      });
      // Mock gateway: pay immediately. (Real gateway → open Razorpay checkout here.)
      await mockPay(token, order.orderId, 'success');
      setPhase('booked');
      // The ticket (PDF + WhatsApp) is generated asynchronously by the outbox
      // relay — poll briefly to reveal the download link once it's ready.
      void pollForTicket(order.orderId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not complete booking');
    } finally {
      setBusy(false);
    }
  }

  async function pollForTicket(orderId: string) {
    if (!token) return;
    for (let i = 0; i < 8; i++) {
      try {
        const orders = await fetchMyOrders(token);
        const mine = orders.find((o) => o.id === orderId);
        if (mine) {
          setBookingRef(mine.referenceNo);
          if (mine.ticketUrl) {
            setTicketUrl(mine.ticketUrl);
            return;
          }
        }
      } catch {
        /* transient — retry */
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  async function onCancel() {
    if (holdToken) await releaseHold(showId, holdToken, heldSeats);
    setPhase('selecting');
    setHoldToken(null);
    setHeldSeats([]);
    void load();
  }

  if (loadError) return <p className="text-red-400">{loadError}</p>;
  if (!map) return <p className="text-neutral-400">Loading seat map…</p>;

  if (phase === 'booked') {
    return (
      <div className="rounded-xl border border-green-700/50 bg-green-900/20 p-8 text-center">
        <div className="text-4xl">✅</div>
        <h2 className="mt-3 text-xl font-semibold">Booking confirmed</h2>
        <p className="mt-1 text-neutral-300">
          Seats {heldSeats.join(', ')} for {map.event.title}.
        </p>
        {bookingRef && (
          <p className="mt-2 font-mono text-sm text-green-300">Reference: {bookingRef}</p>
        )}
        <p className="mt-2 text-sm text-neutral-500">
          Payment captured. Your ticket has been sent on WhatsApp.
        </p>
        <div className="mt-4">
          {ticketUrl ? (
            <a
              href={ticketUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-lg bg-violet-600 px-5 py-2.5 font-medium text-white transition hover:bg-violet-500"
            >
              Download ticket (PDF)
            </a>
          ) : (
            <span className="text-sm text-neutral-500">Generating your ticket…</span>
          )}
        </div>
      </div>
    );
  }

  const heldSet = new Set(heldSeats);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{map.event.title}</h1>
        <p className="text-neutral-400">
          {formatDateTime(map.startsAt)} · {map.hall.name}, {map.hall.venue.name}
        </p>
      </div>

      {/* Screen */}
      <div className="mx-auto w-3/4 rounded-t-full border-t-2 border-violet-500/50 py-2 text-center text-xs uppercase tracking-widest text-neutral-500">
        Stage
      </div>

      {/* Seat grid */}
      <div className="flex flex-col items-center gap-2 overflow-x-auto">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-1.5">
            <span className="w-5 text-right text-xs text-neutral-500">{row.label}</span>
            {row.seats.map((seat) => {
              const isSelected = selected.has(seat.seatRef);
              const isHeldByMe = heldSet.has(seat.seatRef);
              return (
                <button
                  key={seat.seatRef}
                  type="button"
                  onClick={() => toggleSeat(seat)}
                  title={`${seat.seatRef} · ${seat.category.name} · ${formatPrice(seat.price)}`}
                  disabled={phase !== 'selecting' || seat.status !== SeatStatus.Available}
                  className={`h-7 w-7 rounded text-[10px] font-medium transition ${seatClass(
                    seat,
                    isSelected,
                    isHeldByMe,
                  )}`}
                >
                  {seat.seatNumber}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4 text-xs text-neutral-400">
        <Legend className="bg-neutral-700" label="Available" />
        <Legend className="bg-violet-500" label="Selected" />
        <Legend className="bg-amber-500" label="Your hold" />
        <Legend className="bg-neutral-800 ring-1 ring-neutral-600" label="Taken" />
        <Legend className="bg-green-600" label="Booked" />
      </div>

      {/* Summary / actions */}
      <div className="sticky bottom-4 flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/90 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div>
          {phase === 'held' ? (
            <p className="text-sm">
              <span className="font-medium text-amber-400">Holding {heldSeats.join(', ')}</span> ·
              expires in <CountdownBadge seconds={secondsLeft} />
            </p>
          ) : (
            <p className="text-sm text-neutral-300">
              {selectedList.length > 0
                ? `Selected: ${selectedList.join(', ')}`
                : 'Select your seats'}
            </p>
          )}
          <p className="text-lg font-semibold">{formatPrice(totalPaise)}</p>
          {actionError && <p className="mt-1 text-sm text-red-400">{actionError}</p>}
        </div>

        <div className="flex gap-2">
          {phase === 'selecting' && (
            <button
              type="button"
              onClick={onHold}
              disabled={busy || selected.size === 0}
              className="rounded-lg bg-violet-600 px-5 py-2.5 font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Hold seats (1 min)
            </button>
          )}
          {phase === 'held' && (
            <>
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="rounded-lg border border-neutral-700 px-4 py-2.5 text-neutral-300 transition hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="rounded-lg bg-green-600 px-5 py-2.5 font-medium text-white transition hover:bg-green-500 disabled:opacity-50"
              >
                {token ? 'Pay & confirm' : 'Login to book'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function seatClass(seat: SeatMapSeatDto, isSelected: boolean, isHeldByMe: boolean): string {
  if (isHeldByMe) return 'bg-amber-500 text-black';
  if (isSelected) return 'bg-violet-500 text-white';
  switch (seat.status) {
    case SeatStatus.Available:
      return 'bg-neutral-700 text-neutral-200 hover:bg-neutral-600 cursor-pointer';
    case SeatStatus.Locked:
      return 'bg-neutral-800 text-neutral-600 ring-1 ring-neutral-600 cursor-not-allowed';
    case SeatStatus.Booked:
      return 'bg-green-700/60 text-green-200 cursor-not-allowed';
    case SeatStatus.Blocked:
      return 'bg-neutral-800 text-neutral-700 cursor-not-allowed';
    default:
      return 'bg-neutral-800 text-neutral-600 cursor-not-allowed';
  }
}

function groupRows(seats: SeatMapSeatDto[]): { label: string; seats: SeatMapSeatDto[] }[] {
  const byRow = new Map<string, SeatMapSeatDto[]>();
  for (const s of seats) {
    const arr = byRow.get(s.rowLabel) ?? [];
    arr.push(s);
    byRow.set(s.rowLabel, arr);
  }
  return [...byRow.entries()]
    .map(([label, rowSeats]) => ({
      label,
      seats: rowSeats.sort((a, b) => a.seatNumber - b.seatNumber),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded ${className}`} />
      {label}
    </span>
  );
}

function CountdownBadge({ seconds }: { seconds: number }) {
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');
  return (
    <span className={`font-mono font-semibold ${seconds <= 10 ? 'text-red-400' : 'text-amber-400'}`}>
      {mm}:{ss}
    </span>
  );
}
