/** WhatsApp delivery abstraction — Mock for dev, Gupshup (Indian BSP) for prod. */

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export interface TicketMessage {
  to: string; // recipient phone (10-digit or 91-prefixed)
  eventTitle: string;
  startsAt: string; // ISO
  seatRefs: string[];
  referenceNo: string;
  ticketUrl: string; // public signed link to the PDF
}

export interface WhatsAppProvider {
  readonly provider: string;
  sendTicket(msg: TicketMessage): Promise<{ ok: boolean }>;
}
