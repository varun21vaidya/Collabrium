import 'dotenv/config';
import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { IncomingMessage } from 'http';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { handleRelayConnection, flushAllDocuments, getActiveDocCount, getTotalConnections } from './relay/wsRelayServer.js';
import { verifyWsToken, signToken } from './middleware/auth.js';
import DocumentModel from './models/Document.js';
import documentsRouter from './routes/documents.js';
import { logger } from './logger.js';
import { register, httpRequestsTotal, wsConnectionsActive, activeDocumentsGauge } from './metrics.js';

const app = express();
const server = createServer(app);

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

const tokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many token requests, please try again later' },
});

app.use('/api/', apiLimiter);

app.use(pinoHttp({ logger }));

app.use((req: Request, res: Response, next) => {
  res.on('finish', () => {
    httpRequestsTotal.inc({ method: req.method, route: req.route?.path || req.path, status: res.statusCode });
  });
  next();
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.post('/api/auth/demo-token', tokenLimiter, (req: Request, res: Response) => {
  const { userId, name } = req.body;
  if (!userId || !name) {
    res.status(400).json({ error: 'userId and name required' });
    return;
  }
  const token = signToken({ sub: userId, name });
  res.json({ token, userId, name });
});

app.get('/health/ws', (_req: Request, res: Response) => {
  res.json({
    activeDocuments: getActiveDocCount(),
    totalConnections: getTotalConnections(),
    uptime: process.uptime(),
  });
});

app.use('/api/documents', documentsRouter);

const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });

async function checkDocumentAccess(documentId: string, userId: string): Promise<boolean> {
  try {
    const doc = await DocumentModel.findById(documentId)
      .select('ownerId collaboratorIds')
      .lean();
    if (!doc) return false;
    return doc.ownerId === userId || doc.collaboratorIds.includes(userId);
  } catch (err) {
    logger.error('ACL check failed', { documentId, userId, error: (err as Error).message });
    return false;
  }
}

server.on('upgrade', async (request: IncomingMessage, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);

  if (url.pathname !== '/collab') {
    socket.destroy();
    return;
  }

  const documentId = url.searchParams.get('doc');
  const token = url.searchParams.get('token');

  if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  const claims = verifyWsToken(token);
  if (!claims) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  const hasAccess = await checkDocumentAccess(documentId, claims.sub);
  if (!hasAccess) {
    logger.warn('Access denied to document', { documentId, userId: claims.sub });
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
    wss.emit('connection', ws, request, documentId, claims.sub);
  });
});

wss.on('connection', (ws: WebSocket, _req: IncomingMessage, documentId: string, userId: string) => {
  handleRelayConnection(ws, documentId, userId);
});

async function start(): Promise<void> {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/collab-editor';
    await mongoose.connect(mongoUri, {
      maxPoolSize: 50,
      minPoolSize: 10,
      maxIdleTimeMS: 60_000,
      connectTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
    });
    logger.info('MongoDB connected');

    const PORT = parseInt(process.env.PORT || '3002', 10);
    server.listen(PORT, () => {
      logger.info(`Server listening on :${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: (err as Error).message });
    process.exit(1);
  }
}

start();

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}, starting graceful shutdown...`);

  server.close(() => {
    logger.info('HTTP server closed');
  });

  await flushAllDocuments();

  try {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  } catch (err) {
    logger.error('MongoDB disconnect failed', { error: (err as Error).message });
  }

  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

setTimeout(() => {
  if (isShuttingDown) {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }
}, 30_000).unref();
