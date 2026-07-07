import { Controller, Get, Param, Query } from '@nestjs/common';
import type { EventDetailDto, EventSummaryDto, PaginatedDto, VenueDto } from '@ticketing/shared';
import { CatalogService } from './catalog.service';
import { QueryEventsDto } from './dto/query-events.dto';

/** Public, read-only discovery endpoints. */
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('events')
  listEvents(@Query() query: QueryEventsDto): Promise<PaginatedDto<EventSummaryDto>> {
    return this.catalog.listEvents(query);
  }

  @Get('events/:slug')
  getEvent(@Param('slug') slug: string): Promise<EventDetailDto> {
    return this.catalog.getEventBySlug(slug);
  }

  @Get('venues')
  listVenues(): Promise<VenueDto[]> {
    return this.catalog.listVenues();
  }
}
