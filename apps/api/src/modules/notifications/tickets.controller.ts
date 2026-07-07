import { Controller, Get, Header, Param, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { TicketService } from './ticket.service';

/** Public ticket download via a signed link (safe to share over WhatsApp). */
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketService) {}

  @Get(':orderId/download')
  @Header('Content-Type', 'application/pdf')
  async download(
    @Param('orderId') orderId: string,
    @Query('sig') sig: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const path = await this.tickets.verifiedPdfPath(orderId, sig);
    res.set('Content-Disposition', `inline; filename="rangmanch-ticket-${orderId}.pdf"`);
    return new StreamableFile(this.tickets.stream(path));
  }
}
