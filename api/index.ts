import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import authRouter from '../backend/src/routes/auth.ts';
import documentsRouter from '../backend/src/routes/documents.ts';
import invitesRouter from '../backend/src/routes/invites.ts';
import historyRouter from '../backend/src/routes/history.ts';
import { logger } from '../backend/src/logger.ts';
import { register, httpRequestsTotal } from '../backend/src/metrics.ts';
import { getActiveDocCount, getTotalConnections } from '../backend/src/relay/wsRelayServer.ts';

const app = express();

const frontendUrl = process.env.FRONTEND_URL || '';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", frontendUrl || 'https://collabrium-app.vercel.app'],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({ origin: frontendUrl || '*', credentials: true }));
app.use(express.json({ limit: '1mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

app.use('/api/', apiLimiter);

app.use((req: Request, res: Response, next) => {
  res.on('finish', () => {
    httpRequestsTotal.inc({ method: req.method, route: req.route?.path || req.path, status: res.statusCode });
  });
  next();
});

let mongoConnected = false;
let mongoConnecting = false;

async function connectMongo(): Promise<void> {
  if (mongoConnected || mongoConnecting) return;
  mongoConnecting = true;
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/collab-editor';
    await mongoose.connect(uri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30_000,
      connectTimeoutMS: 10_000,
      socketTimeoutMS: 30_000,
    });
    mongoConnected = true;
    logger.info('MongoDB connected');
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'MongoDB connection failed');
  } finally {
    mongoConnecting = false;
  }
}

app.use(async (_req: Request, _res: Response, next: NextFunction) => {
  if (!mongoConnected && !mongoConnecting) {
    await connectMongo();
  }
  next();
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/health/ws', (_req: Request, res: Response) => {
  res.json({
    activeDocuments: getActiveDocCount(),
    totalConnections: getTotalConnections(),
    uptime: process.uptime(),
  });
});

app.get('/health/ready', async (_req: Request, res: Response) => {
  const mongoState = mongoConnected ? 'ok' : 'pending';
  res.json({ status: mongoState === 'ok' ? 'ok' : 'degraded', mongo: mongoState });
});

app.use('/api/auth', authRouter);
app.use('/api/documents', documentsRouter);
app.use('/api', invitesRouter);
app.use('/api/documents', historyRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

connectMongo();

export default app;
