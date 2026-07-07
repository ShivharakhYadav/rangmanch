import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, Ticket, TicketDeliveryStatus } from '@prisma/client';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';

type OrderForTicket = Prisma.OrderGetPayload<{
  include: {
    user: true;
    seats: true;
    show: { include: { event: true; hall: { include: { venue: true } } } };
  };
}>;

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);
  private readonly storageDir: string;
  private readonly publicBase: string;
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.storageDir = resolve(process.cwd(), config.get<string>('TICKET_STORAGE_DIR') ?? 'storage/tickets');
    this.publicBase = config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:6002';
    this.secret = config.get<string>('JWT_ACCESS_SECRET') ?? 'dev';
  }

  /** Build QR + PDF for a confirmed order, persist to disk, upsert the Ticket row. */
  async generate(orderId: string): Promise<{ ticket: Ticket; order: OrderForTicket }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        seats: true,
        show: { include: { event: true, hall: { include: { venue: true } } } },
      },
    });
    if (!order || order.status !== 'CONFIRMED' || !order.referenceNo) {
      throw new NotFoundException('Confirmed order not found');
    }

    const qrPayload = `RANGMANCH|${order.referenceNo}|${order.id}`;
    const qrPng = await QRCode.toBuffer(qrPayload, { width: 240, margin: 1 });

    await mkdir(this.storageDir, { recursive: true });
    const pdfPath = join(this.storageDir, `${order.referenceNo}.pdf`);
    const pdf = await this.renderPdf(order, qrPng);
    await writeFile(pdfPath, pdf);

    const ticket = await this.prisma.ticket.upsert({
      where: { orderId },
      create: {
        orderId,
        referenceNo: order.referenceNo,
        qrPayload,
        pdfPath,
        whatsappTo: order.user.phone,
      },
      update: { pdfPath, referenceNo: order.referenceNo },
    });

    return { ticket, order };
  }

  markStatus(ticketId: string, status: TicketDeliveryStatus): Promise<Ticket> {
    return this.prisma.ticket.update({ where: { id: ticketId }, data: { whatsappStatus: status } });
  }

  /** Public, tamper-proof download link (safe to send over WhatsApp — no JWT needed). */
  signedUrl(orderId: string): string {
    return `${this.publicBase}/api/v1/tickets/${orderId}/download?sig=${this.sign(orderId)}`;
  }

  /** Verify a signed link and return the on-disk PDF path. */
  async verifiedPdfPath(orderId: string, sig: string | undefined): Promise<string> {
    if (!sig || !this.verify(orderId, sig)) {
      throw new UnauthorizedException('Invalid ticket link');
    }
    const ticket = await this.prisma.ticket.findUnique({ where: { orderId } });
    if (!ticket?.pdfPath) throw new NotFoundException('Ticket not found');
    try {
      await access(ticket.pdfPath);
    } catch {
      throw new NotFoundException('Ticket file missing');
    }
    return ticket.pdfPath;
  }

  stream(path: string) {
    return createReadStream(path);
  }

  private sign(orderId: string): string {
    return createHmac('sha256', this.secret).update(orderId).digest('hex').slice(0, 32);
  }

  private verify(orderId: string, sig: string): boolean {
    const expected = this.sign(orderId);
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private renderPdf(order: OrderForTicket, qrPng: Buffer): Promise<Buffer> {
    return new Promise((resolvePdf, reject) => {
      const doc = new PDFDocument({ size: 'A5', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolvePdf(Buffer.concat(chunks)));
      doc.on('error', reject);

      const startsAt = new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(order.show.startsAt);
      const amount = `INR ${(order.amount / 100).toLocaleString('en-IN')}`;

      doc.fontSize(22).fillColor('#7c3aed').text('Rangmanch', { align: 'left' });
      doc.moveDown(0.3).fontSize(9).fillColor('#666').text('e-Ticket');
      doc.moveDown(1).fillColor('#111').fontSize(17).text(order.show.event.title);
      doc.moveDown(0.5).fillColor('#333').fontSize(11).text(startsAt);
      doc.text(`${order.show.hall.name}, ${order.show.hall.venue.name}, ${order.show.hall.venue.city}`);
      doc.moveDown(0.8).fontSize(12).fillColor('#111');
      doc.text(`Seats: ${order.seats.map((s) => s.seatRef).join(', ')}`);
      doc.text(`Amount: ${amount}`);
      doc.text(`Reference: ${order.referenceNo}`);
      doc.moveDown(1).image(qrPng, { fit: [170, 170] });
      doc.moveDown(0.5).fontSize(9).fillColor('#666').text('Show this QR code at the venue for entry.');

      doc.end();
    });
  }
}
