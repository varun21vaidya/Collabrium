import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { roomManager } from './roomManager.js';
import { persistDocument, loadDocument } from '../persistence/mongoPersistence.js';
import { logger } from '../logger.js';
import { wsConnectionsActive, activeDocumentsGauge, persistenceOperations, persistenceDuration } from '../metrics.js';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MAX_MESSAGE_SIZE = 1024 * 1024;
const MAX_CONNECTIONS_PER_DOC = 50;

const activeDocs: Map<string, Y.Doc> = new Map();
const docPromises: Map<string, Promise<Y.Doc>> = new Map();
const persistTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

async function getOrCreateDoc(documentId: string): Promise<Y.Doc> {
  if (activeDocs.has(documentId)) return activeDocs.get(documentId)!;
  if (!docPromises.has(documentId)) {
    const creation = (async () => {
      try {
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
      } finally {
        docPromises.delete(documentId);
      }
    })();
    docPromises.set(documentId, creation);
  }
  return docPromises.get(documentId)!;
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

async function persistWithRetry(documentId: string, state: Uint8Array, maxRetries = 3): Promise<void> {
  const endTimer = persistenceDuration.startTimer({ operation: 'persist' });
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await persistDocument(documentId, state);
      endTimer();
      persistenceOperations.inc({ operation: 'persist', status: 'success' });
      return;
    } catch (err) {
      if (attempt === maxRetries) {
        endTimer();
        persistenceOperations.inc({ operation: 'persist', status: 'failed' });
        throw err;
      }
      const delay = 1000 * 2 ** (attempt - 1);
      logger.warn('Persistence retry', { documentId, attempt, delay, error: (err as Error).message });
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

function schedulePersist(documentId: string, ydoc: Y.Doc): void {
  const existing = persistTimers.get(documentId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    try {
      const state = Y.encodeStateAsUpdate(ydoc);
      await persistWithRetry(documentId, state);
      logger.info('Persisted Y.Doc snapshot', { documentId, bytes: state.byteLength });
    } catch (err) {
      logger.error('Persistence failed after retries', { documentId, error: (err as Error).message });
    } finally {
      persistTimers.delete(documentId);
    }
  }, 2000);
  persistTimers.set(documentId, timer);
}

export async function flushAllDocuments(): Promise<void> {
  const promises = Array.from(activeDocs.entries()).map(async ([docId, ydoc]) => {
    try {
      const state = Y.encodeStateAsUpdate(ydoc);
      await persistDocument(docId, state);
      logger.info('Flushed document on shutdown', { docId });
    } catch (err) {
      logger.error('Flush failed on shutdown', { docId, error: (err as Error).message });
    }
  });
  await Promise.allSettled(promises);
}

const GC_INTERVAL_MS = 60_000;

const gcTimer = setInterval(() => {
  for (const [docId, ydoc] of activeDocs) {
    if (roomManager.getRoomSize(docId) === 0) continue;
    try {
      const stateSize = Y.encodeStateAsUpdate(ydoc).byteLength;
      if (stateSize > 5 * 1024 * 1024) {
        logger.warn('Large Y.Doc detected', { docId, bytes: stateSize });
      }
    } catch (err) {
      logger.error('GC check failed', { docId, error: (err as Error).message });
    }
  }
}, GC_INTERVAL_MS);

export function getActiveDocCount(): number {
  return activeDocs.size;
}

export function getTotalConnections(): number {
  let total = 0;
  for (const docId of activeDocs.keys()) {
    total += roomManager.getRoomSize(docId);
  }
  return total;
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

  if (roomManager.getRoomSize(documentId) >= MAX_CONNECTIONS_PER_DOC) {
    logger.warn('Room full, rejecting connection', { documentId, userId, currentSize: roomManager.getRoomSize(documentId) });
    ws.close(1013, 'Room full');
    return;
  }

  (async () => {
    try {
      ydoc = await getOrCreateDoc(documentId);
      roomManager.join(documentId, ws, userId);

      const fullState = Y.encodeStateAsUpdate(ydoc);
      ws.send(encodeMessage(MESSAGE_SYNC, fullState));

      wsConnectionsActive.set(roomManager.getRoomSize(documentId));
      activeDocumentsGauge.set(activeDocs.size);

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

    if (raw.length > MAX_MESSAGE_SIZE) {
      logger.warn('Message too large, closing connection', { documentId, userId, size: raw.length });
      ws.close(1009, 'Message too large');
      return;
    }

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

      wsConnectionsActive.set(remaining);

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
        activeDocumentsGauge.set(activeDocs.size);
        logger.info('Purged Y.Doc from memory', { documentId });
      }
    }
  });

  ws.on('error', (err) => {
    logger.error('WebSocket error', { documentId, userId, error: err.message });
  });
}
