import Link from 'next/link';
import { EventStatus } from '@ticketing/shared';
import { fetchEvents } from '@/lib/api';
import { EventCard } from '@/components/event-card';

export const dynamic = 'force-dynamic';

const TABS: { status: EventStatus; label: string }[] = [
  { status: EventStatus.Upcoming, label: 'Upcoming' },
  { status: EventStatus.Ongoing, label: 'Ongoing' },
  { status: EventStatus.Past, label: 'Past' },
];

function parseStatus(value: string | undefined): EventStatus {
  const match = TABS.find((t) => t.status === value);
  return match?.status ?? EventStatus.Upcoming;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;
  const active = parseStatus(statusParam);

  let items = [] as Awaited<ReturnType<typeof fetchEvents>>['items'];
  let error: string | null = null;
  try {
    items = (await fetchEvents({ status: active })).items;
  } catch {
    error = 'Could not load events. Is the API running?';
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Events</h1>

      <div className="flex gap-2 border-b border-neutral-800">
        {TABS.map((tab) => {
          const isActive = tab.status === active;
          return (
            <Link
              key={tab.status}
              href={`/events?status=${tab.status}`}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? 'border-violet-500 text-white'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {error && <p className="text-red-400">{error}</p>}
      {!error && items.length === 0 && (
        <p className="text-neutral-500">No {active.toLowerCase()} events right now.</p>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </div>
    </div>
  );
}
