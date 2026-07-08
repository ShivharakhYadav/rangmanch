/**
 * OpenTelemetry tracing bootstrap. Imported FIRST in main.ts (before any
 * instrumented module) so auto-instrumentation can patch http/express/ioredis.
 *
 * Opt-in via the OTEL_ENABLED=true env var (set at launch — this runs before
 * dotenv loads apps/api/.env, so it reads the real process env):
 *   OTEL_ENABLED=true node apps/api/dist/main.js            # console spans
 *   OTEL_ENABLED=true OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318 ... # OTLP
 */
import * as otel from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrismaInstrumentation } from '@prisma/instrumentation';

let sdk: otel.NodeSDK | undefined;

function startTracing(): void {
  if (process.env.OTEL_ENABLED !== 'true') return;
  if (!process.env.OTEL_SERVICE_NAME) process.env.OTEL_SERVICE_NAME = 'ticketing-api';

  // OTLP if an endpoint is configured, otherwise print spans to the console (dev).
  const traceExporter = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? new OTLPTraceExporter()
    : new otel.tracing.ConsoleSpanExporter();

  sdk = new otel.NodeSDK({
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false }, // too noisy
      }),
      new PrismaInstrumentation(),
    ],
  });
  sdk.start();

  process.on('SIGTERM', () => void sdk?.shutdown());
}

startTracing();
