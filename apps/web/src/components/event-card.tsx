import Link from 'next/link';
import type { EventSummaryDto } from '@ticketing/shared';
import { formatDateTime, formatPrice } from '@/lib/format';
import { StatusBadge } from './status-badge';

export function EventCard({ event }: { event: EventSummaryDto }) {
  return (
    <Link
      href={`/events/${event.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/50 transition hover:border-violet-500/50 hover:bg-neutral-900"
    >
      <div className="flex aspect-[3/2] items-center justify-center bg-gradient-to-br from-violet-900/40 to-neutral-900 text-4xl">
        🎭
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-tight group-hover:text-violet-300">{event.title}</h3>
          <StatusBadge status={event.status} />
        </div>
        {event.genre && <p className="text-sm text-neutral-400">{event.genre}</p>}
        <div className="mt-auto flex items-center justify-between pt-2 text-sm">
          <span className="text-neutral-300">
            {event.nextShowAt ? formatDateTime(event.nextShowAt) : 'No upcoming shows'}
          </span>
          <span className="font-medium text-neutral-200">
            {event.minPrice != null ? `${formatPrice(event.minPrice)} onwards` : ''}
          </span>
        </div>
      </div>
    </Link>
  );
}
