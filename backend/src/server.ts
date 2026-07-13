import 'dotenv/config';
import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import mongoose from 'mongoose';
import { IncomingMessage } from 'http';
import rateLimit from 'express-rate-limit';
import { handleRelayConnection, flushAllDocuments, getActiveDocCount, getTotalConnections } from './relay/wsRelayServer.js';
import { verifyWsToken, signToken } from './middleware/auth.js';
import documentsRouter from './routes/documents.js';

const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => console.log(`[INFO] ${msg}`, meta || ''),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(`[ERROR] ${msg}`, meta || ''),
};

const app = express();
const server = createServer(app);

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const tokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many token requests, please try again later' },
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

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request: IncomingMessage, socket, head) => {
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
    await mongoose.connect(mongoUri);
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

const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    logger.info(`Received ${signal}, flushing all documents...`);
    await flushAllDocuments();
    server.close();
    await mongoose.disconnect();
    logger.info('Graceful shutdown complete');
    process.exit(0);
  });
});
