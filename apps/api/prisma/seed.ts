import { PrismaClient, EventStatus, SeatStatus, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

/** Rupees → paise (money is stored as integer minor units). */
const inr = (rupees: number): number => Math.round(rupees * 100);

/** Days from now, at 19:30 local — a plausible showtime. */
function showtime(daysFromNow: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(19, 30, 0, 0);
  return d;
}

// Seat layout: 6 rows × 10 seats, categorised by row.
const ROWS = [
  { label: 'A', category: 'Platinum' },
  { label: 'B', category: 'Platinum' },
  { label: 'C', category: 'Gold' },
  { label: 'D', category: 'Gold' },
  { label: 'E', category: 'Silver' },
  { label: 'F', category: 'Silver' },
];
const SEATS_PER_ROW = 10;

async function main(): Promise<void> {
  // Dev-only clean slate. Order respects FK constraints (children first).
  await prisma.auditLog.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderSeat.deleteMany();
  await prisma.order.deleteMany();
  await prisma.outboxEvent.deleteMany();
  await prisma.processedWebhook.deleteMany();
  await prisma.showSeat.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.show.deleteMany();
  await prisma.eventCast.deleteMany();
  await prisma.eventSponsor.deleteMany();
  await prisma.event.deleteMany();
  await prisma.seatCategory.deleteMany();
  await prisma.hall.deleteMany();
  await prisma.venue.deleteMany();

  // --- Venue + hall + seat categories (Ahmedabad) ---
  const venue = await prisma.venue.create({
    data: {
      name: 'Tagore Hall',
      city: 'Ahmedabad',
      address: 'Paldi, Ahmedabad, Gujarat 380007',
      halls: {
        create: [
          {
            name: 'Main Auditorium',
            capacity: ROWS.length * SEATS_PER_ROW,
            categories: {
              create: [
                { name: 'Platinum', color: '#7c3aed', basePrice: inr(1500) },
                { name: 'Gold', color: '#f59e0b', basePrice: inr(1000) },
                { name: 'Silver', color: '#64748b', basePrice: inr(600) },
              ],
            },
          },
        ],
      },
    },
    include: { halls: { include: { categories: true } } },
  });

  const hall = venue.halls[0]!;
  const categoryByName = new Map(hall.categories.map((c) => [c.name, c]));

  // Admin user — logs in via the normal OTP flow, gets a SUPER_ADMIN JWT.
  await prisma.user.upsert({
    where: { phone: '9000000000' },
    update: { role: UserRole.SUPER_ADMIN },
    create: { phone: '9000000000', name: 'Rangmanch Admin', role: UserRole.SUPER_ADMIN },
  });

  // --- Seat grid ---
  await prisma.seat.createMany({
    data: ROWS.flatMap((row, y) =>
      Array.from({ length: SEATS_PER_ROW }, (_, i) => {
        const seatNumber = i + 1;
        const category = categoryByName.get(row.category)!;
        return {
          hallId: hall.id,
          categoryId: category.id,
          rowLabel: row.label,
          seatNumber,
          seatRef: `${row.label}${seatNumber}`,
          posX: seatNumber,
          posY: y + 1,
        };
      }),
    ),
  });
  const seats = await prisma.seat.findMany({
    where: { hallId: hall.id },
    include: { category: true },
  });

  // --- Events across all three statuses ---
  const events = [
    {
      slug: 'symphony-of-strings',
      title: 'Symphony of Strings',
      genre: 'Classical Concert',
      status: EventStatus.UPCOMING,
      description: 'An evening of Indian classical fusion with a live orchestra.',
      cast: [
        { role: 'Singer', name: 'Anaya Deshmukh' },
        { role: 'Orchestra', name: 'Ahmedabad Philharmonic' },
        { role: 'Anchor', name: 'Rohan Mehta' },
      ],
      sponsors: [{ name: 'Adani Group' }, { name: 'Torrent Power' }],
      shows: [showtime(7), showtime(9)],
    },
    {
      slug: 'monologues-of-the-city',
      title: 'Monologues of the City',
      genre: 'Theatre / Drama',
      status: EventStatus.ONGOING,
      description: 'A powerful set of solo performances on urban life.',
      cast: [
        { role: 'Anchor', name: 'Kabir Shah' },
        { role: 'Singer', name: 'Meera Iyer' },
      ],
      sponsors: [{ name: 'Zydus' }],
      shows: [showtime(0), showtime(2)],
    },
    {
      slug: 'garba-nights-2026',
      title: 'Garba Nights 2026',
      genre: 'Folk / Dance',
      status: EventStatus.PAST,
      description: 'A grand Navratri celebration with traditional Garba and Dandiya.',
      cast: [
        { role: 'Singer', name: 'Falguni Pathak' },
        { role: 'Orchestra', name: 'Dhol Tasha Troupe' },
      ],
      sponsors: [{ name: 'Amul' }, { name: 'GSFC' }],
      shows: [showtime(-30), showtime(-28)],
    },
  ];

  let firstUpcomingShowId: string | null = null;

  for (const e of events) {
    const created = await prisma.event.create({
      data: {
        slug: e.slug,
        title: e.title,
        genre: e.genre,
        status: e.status,
        description: e.description,
        cast: { create: e.cast },
        sponsors: { create: e.sponsors },
        shows: { create: e.shows.map((startsAt) => ({ hallId: hall.id, startsAt, basePrice: inr(600) })) },
      },
      include: { shows: true },
    });

    // Generate show-seats for each show, priced by the seat's category.
    for (const show of created.shows) {
      await prisma.showSeat.createMany({
        data: seats.map((s) => ({
          showId: show.id,
          seatId: s.id,
          price: s.category.basePrice,
          status: SeatStatus.AVAILABLE,
        })),
      });
      if (e.status === EventStatus.UPCOMING && !firstUpcomingShowId) {
        firstUpcomingShowId = show.id;
      }
    }
  }

  // Demonstrate admin offline pre-blocking: block A1 and A2 on the first upcoming show.
  if (firstUpcomingShowId) {
    const blockedSeats = seats.filter((s) => s.seatRef === 'A1' || s.seatRef === 'A2');
    await prisma.showSeat.updateMany({
      where: { showId: firstUpcomingShowId, seatId: { in: blockedSeats.map((s) => s.id) } },
      data: { status: SeatStatus.BLOCKED },
    });
  }

  const counts = {
    venues: await prisma.venue.count(),
    halls: await prisma.hall.count(),
    seats: await prisma.seat.count(),
    events: await prisma.event.count(),
    shows: await prisma.show.count(),
    showSeats: await prisma.showSeat.count(),
  };
  console.log('Seed complete:', counts);
  if (firstUpcomingShowId) console.log('First upcoming showId:', firstUpcomingShowId);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
