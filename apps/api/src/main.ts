import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody enabled so payment-webhook signatures can be verified over the exact bytes.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  // Structured logging via pino.
  app.useLogger(app.get(Logger));

  // Global input validation: strip unknown props, reject extras, auto-transform.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Versioned API prefix (health stays unprefixed for load balancers/k8s probes).
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  // CORS for the web app (tighten allowed origins per-env later).
  app.enableCors({ origin: true, credentials: true });

  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 6002);
  await app.listen(port);
  app.get(Logger).log(`ticketing-api listening on http://localhost:${port}`);
}

void bootstrap();
