import { SeatBooking } from '@/components/seat-booking';

export default async function ShowPage({ params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params;
  return <SeatBooking showId={showId} />;
}
