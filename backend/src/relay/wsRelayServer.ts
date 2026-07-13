import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { roomManager } from './roomManager.js';
import { persistDocument, loadDocument } from '../persistence/mongoPersistence.js';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const activeDocs: Map<string, Y.Doc> = new Map();
const persistTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => console.log(`[INFO] ${msg}`, meta || ''),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(`[WARN] ${msg}`, meta || ''),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(`[ERROR] ${msg}`, meta || ''),
};

async function getOrCreateDoc(documentId: string): Promise<Y.Doc> {
  const existing = activeDocs.get(documentId);
  if (existing) return existing;

  const doc = new Y.Doc();
  const savedState = await loadDocument(documentId);
  if (savedState) {
    try {
      Y.applyUpdate(doc, savedState);
      logger.info('Loaded Y.Doc from persistence', { documentId, bytes: savedState.byteLength });
    } catch (err) {
      logger.error('Failed to apply persisted state', { documentId, error: (err as Error).message });
    }
  }
  activeDocs.set(documentId, doc);
  return doc;
}

function encodeMessage(type: number, payload: Uint8Array): Buffer {
  const buf = Buffer.allocUnsafe(payload.byteLength + 1);
  buf[0] = type;
  Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength).copy(buf, 1);
  return buf;
}

function decodeMessage(data: Buffer): { type: number; payload: Uint8Array } {
  return {
    type: data[0],
    payload: new Uint8Array(data.buffer, data.byteOffset + 1, data.byteLength - 1),
  };
}

function schedulePersist(documentId: string, ydoc: Y.Doc): void {
  const existing = persistTimers.get(documentId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    try {
      const state = Y.encodeStateAsUpdate(ydoc);
      await persistDocument(documentId, state);
      logger.info('Persisted Y.Doc snapshot', { documentId, bytes: state.byteLength });
    } catch (err) {
      logger.error('Persistence failed', { documentId, error: (err as Error).message });
    } finally {
      persistTimers.delete(documentId);
    }
  }, 2000);
  persistTimers.set(documentId, timer);
}

export function handleRelayConnection(ws: WebSocket, documentId: string, userId: string): void {
  let ydoc: Y.Doc | null = null;
  let isAlive = true;

  const heartbeatInterval = setInterval(() => {
    if (!isAlive) {
      logger.warn('Terminating dead socket', { documentId, userId });
      ws.terminate();
      return;
    }
    isAlive = false;
    try {
      ws.ping();
    } catch (err) {
      logger.warn('Ping failed', { documentId, userId, error: (err as Error).message });
    }
  }, 30000);

  ws.on('pong', () => {
    isAlive = true;
  });

  (async () => {
    try {
      ydoc = await getOrCreateDoc(documentId);
      roomManager.join(documentId, ws, userId);

      const fullState = Y.encodeStateAsUpdate(ydoc);
      ws.send(encodeMessage(MESSAGE_SYNC, fullState));

      logger.info('Client joined document', {
        documentId,
        userId,
        roomSize: roomManager.getRoomSize(documentId),
      });
    } catch (err) {
      logger.error('Failed to initialize relay connection', {
        documentId,
        userId,
        error: (err as Error).message,
      });
      ws.close();
    }
  })();

  ws.on('message', (raw: Buffer) => {
    if (!ydoc) return;

    try {
      const { type, payload } = decodeMessage(raw);

      if (type === MESSAGE_SYNC) {
        Y.applyUpdate(ydoc, payload, 'relay');
        roomManager.broadcast(documentId, ws, raw);
        schedulePersist(documentId, ydoc);
      } else if (type === MESSAGE_AWARENESS) {
        roomManager.broadcast(documentId, ws, raw);
      } else {
        logger.warn('Unknown message type', { documentId, userId, type });
      }
    } catch (err) {
      logger.error('Message processing error', {
        documentId,
        userId,
        error: (err as Error).message,
      });
    }
  });

  ws.on('close', async () => {
    clearInterval(heartbeatInterval);

    if (ydoc) {
      roomManager.leave(documentId, ws);
      const remaining = roomManager.getRoomSize(documentId);

      logger.info('Client left document', { documentId, userId, remaining });

      if (remaining === 0) {
        try {
          const state = Y.encodeStateAsUpdate(ydoc);
          await persistDocument(documentId, state);
          logger.info('Final flush on empty room', { documentId, bytes: state.byteLength });
        } catch (err) {
          logger.error('Final persistence failed', {
            documentId,
            error: (err as Error).message,
          });
        }

        const timer = persistTimers.get(documentId);
        if (timer) {
          clearTimeout(timer);
          persistTimers.delete(documentId);
        }

        ydoc.destroy();
        activeDocs.delete(documentId);
        logger.info('Purged Y.Doc from memory', { documentId });
      }
    }
  });

  ws.on('error', (err) => {
    logger.error('WebSocket error', { documentId, userId, error: err.message });
  });
}
