import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import authRouter from './routes/auth.js';
import documentsRouter from './routes/documents.js';
import invitesRouter from './routes/invites.js';
import historyRouter from './routes/history.js';
import { logger } from './logger.js';
import { initSentry } from './sentry.js';
import { register, httpRequestsTotal } from './metrics.js';
import { getActiveDocCount, getTotalConnections } from './relay/wsRelayServer.js';

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:5173'],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

app.use('/api/', apiLimiter);
app.use(pinoHttp({ logger }));

app.use((req: Request, res: Response, next) => {
  res.on('finish', () => {
    httpRequestsTotal.inc({ method: req.method, route: req.route?.path || req.path, status: res.statusCode });
  });
  next();
});

initSentry(app);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use('/api/auth', authRouter);

app.get('/health/ws', (_req: Request, res: Response) => {
  const mem = process.memoryUsage();
  res.json({
    activeDocuments: getActiveDocCount(),
    totalConnections: getTotalConnections(),
    uptime: process.uptime(),
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
    },
  });
});

app.get('/health/ready', async (_req: Request, res: Response) => {
  const mongoState = mongoose.connection.readyState === 1 ? 'ok' : 'failed';
  if (mongoState === 'failed') {
    res.status(503).json({ status: 'unhealthy', mongo: mongoState });
    return;
  }
  res.json({ status: 'ok', mongo: mongoState });
});

app.use('/api/documents', documentsRouter);
app.use('/api', invitesRouter);
app.use('/api/documents', historyRouter);

export default app;
