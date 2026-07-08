// Must be first — starts OpenTelemetry before instrumented modules load.
import './observability/tracing';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody enabled so payment-webhook signatures can be verified over the exact bytes.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  // Structured logging via pino.
  app.useLogger(app.get(Logger));

  // Security headers.
  app.use(helmet());

  // Global input validation: strip unknown props, reject extras, auto-transform.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Versioned API prefix (health + metrics stay unprefixed for probes/scrapers).
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics'] });

  // CORS restricted to configured origins.
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:6001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 6002);
  await app.listen(port);
  app.get(Logger).log(`ticketing-api listening on http://localhost:${port}`);
}

void bootstrap();
