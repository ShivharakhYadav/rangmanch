/** Response shape for the API health endpoint. Consumed by web + monitoring. */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  service: string;
  version: string;
  timestamp: string;
  dependencies?: Record<string, 'up' | 'down'>;
}
