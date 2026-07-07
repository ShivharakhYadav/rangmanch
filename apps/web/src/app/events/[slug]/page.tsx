import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchEventBySlug } from '@/lib/api';
import { formatDateTime, formatPrice } from '@/lib/format';
import { StatusBadge } from '@/components/status-badge';

export const dynamic = 'force-dynamic';

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await fetchEventBySlug(slug);
  if (!event) notFound();

  return (
    <article className="flex flex-col gap-8">
      {/* Banner */}
      <div className="flex aspect-[16/6] items-center justify-center rounded-2xl bg-gradient-to-br from-violet-900/40 to-neutral-900 text-6xl">
        🎭
      </div>

      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{event.title}</h1>
          <StatusBadge status={event.status} />
        </div>
        {event.genre && <p className="text-neutral-400">{event.genre}</p>}
        {event.description && <p className="max-w-2xl text-neutral-300">{event.description}</p>}
      </header>

      {/* Cast */}
      {event.cast.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Cast & Crew</h2>
          <div className="flex flex-wrap gap-3">
            {event.cast.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-2"
              >
                <div className="text-xs uppercase tracking-wide text-neutral-500">{c.role}</div>
                <div className="text-sm font-medium">{c.name}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Showtimes */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Showtimes</h2>
        {event.shows.length === 0 ? (
          <p className="text-neutral-500">No shows scheduled.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {event.shows.map((show) => (
              <div
                key={show.id}
                className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3"
              >
                <div>
                  <div className="font-medium">{formatDateTime(show.startsAt)}</div>
                  <div className="text-sm text-neutral-400">
                    {show.hall.name} · {show.hall.venue.name}, {show.hall.venue.city}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-neutral-300">
                    {formatPrice(show.basePrice)} onwards
                  </span>
                  <Link
                    href={`/shows/${show.id}`}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500"
                  >
                    Book
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Sponsors */}
      {event.sponsors.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Sponsors</h2>
          <div className="flex flex-wrap gap-3 text-sm text-neutral-400">
            {event.sponsors.map((s) => (
              <span key={s.id} className="rounded-md bg-neutral-800/60 px-3 py-1">
                {s.name}
              </span>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
