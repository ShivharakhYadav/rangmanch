import { Logger } from '@nestjs/common';
import type { TicketMessage, WhatsAppProvider } from './whatsapp-provider';

/** Dev provider — logs the message instead of sending. Swap for Gupshup in prod. */
export class MockWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger('WhatsApp:mock');
  readonly provider = 'mock';

  sendTicket(msg: TicketMessage): Promise<{ ok: boolean }> {
    this.logger.log(
      `→ ${msg.to} | ${msg.eventTitle} | seats ${msg.seatRefs.join(',')} | ref ${msg.referenceNo} | document: ${msg.ticketUrl}`,
    );
    return Promise.resolve({ ok: true });
  }
}
