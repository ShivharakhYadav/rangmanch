import Link from 'next/link';
import { EventStatus, type EventSummaryDto } from '@ticketing/shared';
import { fetchEvents } from '@/lib/api';
import { EventCard } from '@/components/event-card';

export const dynamic = 'force-dynamic';

async function safeEvents(status: EventStatus): Promise<EventSummaryDto[]> {
  try {
    const res = await fetchEvents({ status });
    return res.items;
  } catch {
    return [];
  }
}

export default async function Home() {
  const [ongoing, upcoming] = await Promise.all([
    safeEvents(EventStatus.Ongoing),
    safeEvents(EventStatus.Upcoming),
  ]);
  const hasContent = ongoing.length + upcoming.length > 0;

  return (
    <div className="flex flex-col gap-12">
      <section className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-violet-900/30 via-neutral-900 to-neutral-950 p-10">
        <h1 className="max-w-xl text-4xl font-bold leading-tight">
          Live theatre, concerts & events — booked in seconds.
        </h1>
        <p className="mt-3 max-w-lg text-neutral-400">
          Discover shows across the city, pick your seats, and get your ticket on WhatsApp.
        </p>
        <Link
          href="/events"
          className="mt-6 inline-block rounded-lg bg-violet-600 px-5 py-2.5 font-medium text-white transition hover:bg-violet-500"
        >
          Browse all events →
        </Link>
      </section>

      {!hasContent && (
        <p className="text-neutral-500">
          No events to show yet. If you just started the API, make sure it&apos;s running and seeded.
        </p>
      )}

      {ongoing.length > 0 && (
        <Section title="Happening now">
          {ongoing.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title="Upcoming">
          {upcoming.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}
