import type { EventStatus } from '@ticketing/shared';

const STYLES: Record<EventStatus, string> = {
  UPCOMING: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  ONGOING: 'bg-green-500/15 text-green-300 ring-green-500/30',
  PAST: 'bg-neutral-500/15 text-neutral-400 ring-neutral-500/30',
};

const LABELS: Record<EventStatus, string> = {
  UPCOMING: 'Upcoming',
  ONGOING: 'Ongoing',
  PAST: 'Past',
};

export function StatusBadge({ status }: { status: EventStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
