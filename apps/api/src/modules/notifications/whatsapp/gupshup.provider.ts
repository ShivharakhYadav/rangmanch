import { Logger } from '@nestjs/common';
import type { TicketMessage, WhatsAppProvider } from './whatsapp-provider';

/**
 * Gupshup WhatsApp Business API. Activated when WHATSAPP_PROVIDER=gupshup and
 * credentials are set. Note: production should use an approved template message
 * (and ideally send the PDF as a media attachment); this sends a text with a link.
 */
export class GupshupWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger('WhatsApp:gupshup');
  readonly provider = 'gupshup';

  constructor(
    private readonly apiKey: string,
    private readonly source: string,
    private readonly appName: string,
  ) {}

  async sendTicket(msg: TicketMessage): Promise<{ ok: boolean }> {
    const destination = msg.to.startsWith('91') ? msg.to : `91${msg.to}`;
    const caption =
      `🎟️ Booking confirmed — ${msg.eventTitle}\n` +
      `Seats: ${msg.seatRefs.join(', ')}\n` +
      `Ref: ${msg.referenceNo}`;

    // Send the ticket PDF itself as a WhatsApp document (not just a link).
    // ticketUrl is a public signed URL that serves application/pdf.
    const body = new URLSearchParams({
      channel: 'whatsapp',
      source: this.source,
      destination,
      'src.name': this.appName,
      message: JSON.stringify({
        type: 'file',
        url: msg.ticketUrl,
        filename: `rangmanch-ticket-${msg.referenceNo}.pdf`,
        caption,
      }),
    });

    try {
      const res = await fetch('https://api.gupshup.io/wa/api/v1/msg', {
        method: 'POST',
        headers: { apikey: this.apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) this.logger.warn(`Gupshup send failed: ${res.status}`);
      return { ok: res.ok };
    } catch (err) {
      this.logger.error(`Gupshup error: ${String(err)}`);
      return { ok: false };
    }
  }
}
