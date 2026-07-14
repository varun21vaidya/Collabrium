import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import authRouter from '../backend/dist/routes/auth.js';
import documentsRouter from '../backend/dist/routes/documents.js';
import invitesRouter from '../backend/dist/routes/invites.js';
import historyRouter from '../backend/dist/routes/history.js';
import { logger } from '../backend/dist/logger.js';
import { register, httpRequestsTotal } from '../backend/dist/metrics.js';
import { getActiveDocCount, getTotalConnections } from '../backend/dist/relay/wsRelayServer.js';

const app = express();
app.set('trust proxy', 1);

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

app.use((req, res, next) => {
  res.on('finish', () => {
    httpRequestsTotal.inc({ method: req.method, route: req.route?.path || req.path, status: res.statusCode });
  });
  next();
});

// Disable Mongoose operation buffering globally
mongoose.set('bufferCommands', false);

// Serverless MongoDB connection cache
let dbPromise = null;

async function dbConnect() {
  if (dbPromise) return dbPromise;
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/collab-editor';
  logger.info({ uri: uri.replace(/\/\/.*@/, '//***@') }, 'Connecting to MongoDB');
  dbPromise = mongoose.connect(uri, {
    maxPoolSize: 10,
    minPoolSize: 2,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 60000,
    serverSelectionTimeoutMS: 15000,
  });
  try {
    await dbPromise;
    logger.info('MongoDB connected');
  } catch (err) {
    dbPromise = null;
    logger.error({ error: err.message }, 'MongoDB connection failed');
    throw err;
  }
}

// Middleware: ensure DB connected before every request
app.use(async (_req, _res, next) => {
  try {
    await dbConnect();
  } catch {
    // connection failed — routes will fail fast (bufferCommands: false)
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/health/ws', (_req, res) => {
  res.json({
    activeDocuments: getActiveDocCount(),
    totalConnections: getTotalConnections(),
    uptime: process.uptime(),
  });
});

app.get('/health/ready', async (_req, res) => {
  const mongoState = mongoose.connection.readyState === 1 ? 'ok' : 'pending';
  res.json({ status: mongoState === 'ok' ? 'ok' : 'degraded', mongo: mongoState });
});

app.use('/api/auth', authRouter);
app.use('/api/documents', documentsRouter);
app.use('/api', invitesRouter);
app.use('/api/documents', historyRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;
