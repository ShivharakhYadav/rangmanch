import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { EventDetailDto, ShowDto, VenueDto } from '@ticketing/shared';
import { AdminKeyGuard } from '../../common/guards/admin-key.guard';
import { CatalogService } from './catalog.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateShowDto } from './dto/create-show.dto';

/**
 * Admin write endpoints. Guarded by a shared API key for now (x-admin-api-key);
 * replaced by JWT + RBAC in Phase 3+.
 */
@Controller('admin')
@UseGuards(AdminKeyGuard)
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Post('venues')
  createVenue(@Body() dto: CreateVenueDto): Promise<VenueDto> {
    return this.catalog.createVenue(dto);
  }

  @Post('events')
  createEvent(@Body() dto: CreateEventDto): Promise<EventDetailDto> {
    return this.catalog.createEvent(dto);
  }

  @Patch('events/:id')
  updateEvent(@Param('id') id: string, @Body() dto: UpdateEventDto): Promise<EventDetailDto> {
    return this.catalog.updateEvent(id, dto);
  }

  @Delete('events/:id')
  deleteEvent(@Param('id') id: string): Promise<{ id: string }> {
    return this.catalog.deleteEvent(id);
  }

  @Post('events/:id/shows')
  createShow(@Param('id') id: string, @Body() dto: CreateShowDto): Promise<ShowDto> {
    return this.catalog.createShow(id, dto);
  }
}
