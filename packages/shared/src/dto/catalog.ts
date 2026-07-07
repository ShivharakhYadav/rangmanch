import { EventStatus } from '../enums';

/** A venue (theatre/auditorium building). */
export interface VenueDto {
  id: string;
  name: string;
  city: string;
  address: string | null;
}

export interface EventCastDto {
  id: string;
  role: string; // Singer / Orchestra / Anchor
  name: string;
}

export interface EventSponsorDto {
  id: string;
  name: string;
  logoUrl: string | null;
}

/** A single scheduled screening of an event in a hall. */
export interface ShowDto {
  id: string;
  startsAt: string; // ISO 8601
  basePrice: number; // paise (INR minor units)
  hall: {
    id: string;
    name: string;
    venue: { id: string; name: string; city: string };
  };
}

/** Compact event shape for listing/discovery pages. */
export interface EventSummaryDto {
  id: string;
  slug: string;
  title: string;
  genre: string | null;
  status: EventStatus;
  posterUrl: string | null;
  nextShowAt: string | null; // ISO of earliest upcoming show, if any
  minPrice: number | null; // paise
}

/** Full event shape for the detail page. */
export interface EventDetailDto extends EventSummaryDto {
  description: string | null;
  bannerUrl: string | null;
  cast: EventCastDto[];
  sponsors: EventSponsorDto[];
  shows: ShowDto[];
}

export interface PaginatedDto<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
