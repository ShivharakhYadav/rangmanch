import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole, type EventDetailDto, type ShowDto, type VenueDto } from '@ticketing/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CatalogService } from './catalog.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateShowDto } from './dto/create-show.dto';

/** Admin catalog management — JWT + role-based access (venue managers & super admins). */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VenueManager, UserRole.SuperAdmin)
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
