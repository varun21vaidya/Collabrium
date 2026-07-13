import client from 'prom-client';

const register = new client.Registry();

client.collectDefaultMetrics({ register });

export const httpRequestsTotal = new client.Counter({
  name: 'collabrium_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [register],
});

export const wsConnectionsActive = new client.Gauge({
  name: 'collabrium_ws_connections_active',
  help: 'Active WebSocket connections',
  registers: [register],
});

export const activeDocumentsGauge = new client.Gauge({
  name: 'collabrium_active_documents',
  help: 'Number of active Y.Doc instances in memory',
  registers: [register],
});

export const persistenceOperations = new client.Counter({
  name: 'collabrium_persistence_operations_total',
  help: 'Total persistence operations',
  labelNames: ['operation', 'status'] as const,
  registers: [register],
});

export const persistenceDuration = new client.Histogram({
  name: 'collabrium_persistence_duration_seconds',
  help: 'Persistence operation duration',
  labelNames: ['operation'] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export { register };
