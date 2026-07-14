import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import mongoose from 'mongoose';
import { IncomingMessage } from 'http';
import { verifyWsToken } from './middleware/auth.js';
import DocumentModel from './models/Document.js';
import app from './app.js';
import { logger } from './logger.js';
import { handleRelayConnection, flushAllDocuments } from './relay/wsRelayServer.js';

const server = createServer(app);

const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });

async function checkDocumentAccess(documentId: string, userId: string): Promise<boolean> {
  try {
    const doc = await DocumentModel.findById(documentId)
      .select('ownerId collaboratorIds')
      .lean();
    if (!doc) return false;
    return doc.ownerId === userId || doc.collaboratorIds.includes(userId);
  } catch (err) {
    logger.error({ documentId, userId, error: (err as Error).message }, 'ACL check failed');
    return false;
  }
}

server.on('upgrade', async (request: IncomingMessage, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);

  if (url.pathname.startsWith('/api')) {
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
    logger.warn({ documentId, userId: claims.sub }, 'Access denied to document');
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
    logger.error({ error: (err as Error).message }, 'Failed to start server');
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
    logger.error({ error: (err as Error).message }, 'MongoDB disconnect failed');
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
