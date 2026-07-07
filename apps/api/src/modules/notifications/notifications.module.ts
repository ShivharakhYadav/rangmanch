import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TicketsController } from './tickets.controller';
import { TicketService } from './ticket.service';
import { OutboxRelayService } from './outbox-relay.service';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from './whatsapp/whatsapp-provider';
import { MockWhatsAppProvider } from './whatsapp/mock.provider';
import { GupshupWhatsAppProvider } from './whatsapp/gupshup.provider';

const whatsappProvider = {
  provide: WHATSAPP_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): WhatsAppProvider => {
    if (config.get<string>('WHATSAPP_PROVIDER') === 'gupshup') {
      const apiKey = config.get<string>('GUPSHUP_API_KEY');
      const source = config.get<string>('GUPSHUP_SOURCE');
      const appName = config.get<string>('GUPSHUP_APP_NAME');
      if (!apiKey || !source || !appName) {
        throw new Error('WHATSAPP_PROVIDER=gupshup requires GUPSHUP_API_KEY, GUPSHUP_SOURCE, GUPSHUP_APP_NAME');
      }
      return new GupshupWhatsAppProvider(apiKey, source, appName);
    }
    return new MockWhatsAppProvider();
  },
};

@Module({
  controllers: [TicketsController],
  providers: [TicketService, OutboxRelayService, whatsappProvider],
  exports: [TicketService],
})
export class NotificationsModule {}
