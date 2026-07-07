import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, EventStatus as PrismaEventStatus } from '@prisma/client';
import type {
  EventDetailDto,
  EventSummaryDto,
  PaginatedDto,
  ShowDto,
  VenueDto,
} from '@ticketing/shared';
import { EventStatus } from '@ticketing/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryEventsDto } from './dto/query-events.dto';
import { CreateVenueDto } from './dto/create-venue.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateShowDto } from './dto/create-show.dto';

// Row shapes returned by the queries below (type-only; orderBy doesn't affect payload).
type ShowRow = Prisma.ShowGetPayload<{ include: { hall: { include: { venue: true } } } }>;
type EventSummaryRow = Prisma.EventGetPayload<{
  include: { shows: { include: { hall: { include: { venue: true } } } } };
}>;
type EventDetailRow = Prisma.EventGetPayload<{
  include: {
    cast: true;
    sponsors: true;
    shows: { include: { hall: { include: { venue: true } } } };
  };
}>;

const summaryInclude = {
  shows: { include: { hall: { include: { venue: true } } } },
};
const detailInclude = {
  cast: true,
  sponsors: true,
  shows: { include: { hall: { include: { venue: true } } }, orderBy: { startsAt: 'asc' } },
} as const;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Public reads ----------

  async listEvents(q: QueryEventsDto): Promise<PaginatedDto<EventSummaryDto>> {
    const where: Prisma.EventWhereInput = {};
    if (q.status) where.status = q.status as unknown as PrismaEventStatus;
    if (q.city) {
      where.shows = {
        some: { hall: { venue: { city: { equals: q.city, mode: 'insensitive' } } } },
      };
    }

    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        include: summaryInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toSummary(r)),
      total,
      page,
      pageSize,
    };
  }

  async getEventBySlug(slug: string): Promise<EventDetailDto> {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      include: detailInclude,
    });
    if (!event) throw new NotFoundException(`Event "${slug}" not found`);
    return this.toDetail(event);
  }

  async listVenues(): Promise<VenueDto[]> {
    const venues = await this.prisma.venue.findMany({ orderBy: { name: 'asc' } });
    return venues.map((v) => ({ id: v.id, name: v.name, city: v.city, address: v.address }));
  }

  // ---------- Admin writes ----------

  async createVenue(dto: CreateVenueDto): Promise<VenueDto> {
    const v = await this.prisma.venue.create({ data: dto });
    return { id: v.id, name: v.name, city: v.city, address: v.address };
  }

  async createEvent(dto: CreateEventDto): Promise<EventDetailDto> {
    try {
      const created = await this.prisma.event.create({
        data: {
          title: dto.title,
          slug: dto.slug,
          description: dto.description,
          genre: dto.genre,
          status: (dto.status as unknown as PrismaEventStatus) ?? PrismaEventStatus.UPCOMING,
          posterUrl: dto.posterUrl,
          bannerUrl: dto.bannerUrl,
          cast: dto.cast?.length ? { create: dto.cast } : undefined,
          sponsors: dto.sponsors?.length ? { create: dto.sponsors } : undefined,
        },
        include: detailInclude,
      });
      return this.toDetail(created);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`An event with slug "${dto.slug}" already exists`);
      }
      throw e;
    }
  }

  async updateEvent(id: string, dto: UpdateEventDto): Promise<EventDetailDto> {
    try {
      const updated = await this.prisma.event.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          genre: dto.genre,
          status: dto.status ? (dto.status as unknown as PrismaEventStatus) : undefined,
          posterUrl: dto.posterUrl,
          bannerUrl: dto.bannerUrl,
        },
        include: detailInclude,
      });
      return this.toDetail(updated);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException(`Event "${id}" not found`);
      }
      throw e;
    }
  }

  async deleteEvent(id: string): Promise<{ id: string }> {
    try {
      await this.prisma.event.delete({ where: { id } });
      return { id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException(`Event "${id}" not found`);
      }
      throw e;
    }
  }

  async createShow(eventId: string, dto: CreateShowDto): Promise<ShowDto> {
    const [event, hall] = await Promise.all([
      this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true } }),
      this.prisma.hall.findUnique({ where: { id: dto.hallId }, select: { id: true } }),
    ]);
    if (!event) throw new NotFoundException(`Event "${eventId}" not found`);
    if (!hall) throw new NotFoundException(`Hall "${dto.hallId}" not found`);

    const show = await this.prisma.show.create({
      data: {
        eventId,
        hallId: dto.hallId,
        startsAt: new Date(dto.startsAt),
        basePrice: dto.basePrice,
      },
      include: { hall: { include: { venue: true } } },
    });
    return this.toShowDto(show);
  }

  // ---------- Mappers ----------

  private toShowDto(s: ShowRow): ShowDto {
    return {
      id: s.id,
      startsAt: s.startsAt.toISOString(),
      basePrice: s.basePrice,
      hall: {
        id: s.hall.id,
        name: s.hall.name,
        venue: { id: s.hall.venue.id, name: s.hall.venue.name, city: s.hall.venue.city },
      },
    };
  }

  private toSummary(e: EventSummaryRow): EventSummaryDto {
    const now = Date.now();
    const upcoming = e.shows
      .filter((s) => s.startsAt.getTime() >= now)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const nextShowAt = upcoming.length ? upcoming[0]!.startsAt.toISOString() : null;
    const minPrice = e.shows.length ? Math.min(...e.shows.map((s) => s.basePrice)) : null;

    return {
      id: e.id,
      slug: e.slug,
      title: e.title,
      genre: e.genre,
      status: e.status as unknown as EventStatus,
      posterUrl: e.posterUrl,
      nextShowAt,
      minPrice,
    };
  }

  private toDetail(e: EventDetailRow): EventDetailDto {
    return {
      ...this.toSummary(e),
      description: e.description,
      bannerUrl: e.bannerUrl,
      cast: e.cast.map((c) => ({ id: c.id, role: c.role, name: c.name })),
      sponsors: e.sponsors.map((s) => ({ id: s.id, name: s.name, logoUrl: s.logoUrl })),
      shows: e.shows.map((s) => this.toShowDto(s)),
    };
  }
}
