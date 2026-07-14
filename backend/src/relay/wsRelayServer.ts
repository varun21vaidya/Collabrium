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
            logger.info({ documentId, bytes: savedState.byteLength }, 'Loaded Y.Doc from persistence');
          } catch (err) {
            logger.error({ documentId, error: (err as Error).message }, 'Failed to apply persisted state');
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
      logger.warn({ documentId, attempt, delay, error: (err as Error).message }, 'Persistence retry');
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
      logger.info({ documentId, bytes: state.byteLength }, 'Persisted Y.Doc snapshot');
    } catch (err) {
      logger.error({ documentId, error: (err as Error).message }, 'Persistence failed after retries');
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
      logger.info({ docId }, 'Flushed document on shutdown');
    } catch (err) {
      logger.error({ docId, error: (err as Error).message }, 'Flush failed on shutdown');
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
        logger.warn({ docId, bytes: stateSize }, 'Large Y.Doc detected');
      }
    } catch (err) {
      logger.error({ docId, error: (err as Error).message }, 'GC check failed');
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
      logger.warn({ documentId, userId }, 'Terminating dead socket');
      ws.terminate();
      return;
    }
    isAlive = false;
    try {
      ws.ping();
    } catch (err) {
      logger.warn({ documentId, userId, error: (err as Error).message }, 'Ping failed');
    }
  }, 30000);

  ws.on('pong', () => {
    isAlive = true;
  });

  if (roomManager.getRoomSize(documentId) >= MAX_CONNECTIONS_PER_DOC) {
    logger.warn({ documentId, userId, currentSize: roomManager.getRoomSize(documentId) }, 'Room full, rejecting connection');
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

      logger.info({
        documentId,
        userId,
        roomSize: roomManager.getRoomSize(documentId),
      }, 'Client joined document');
    } catch (err) {
      logger.error({
        documentId,
        userId,
        error: (err as Error).message,
      }, 'Failed to initialize relay connection');
      ws.close();
    }
  })();

  ws.on('message', (raw: Buffer) => {
    if (!ydoc) return;

    if (raw.length > MAX_MESSAGE_SIZE) {
      logger.warn({ documentId, userId, size: raw.length }, 'Message too large, closing connection');
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
        logger.warn({ documentId, userId, type }, 'Unknown message type');
      }
    } catch (err) {
      logger.error({
        documentId,
        userId,
        error: (err as Error).message,
      }, 'Message processing error');
    }
  });

  ws.on('close', async () => {
    clearInterval(heartbeatInterval);

    if (ydoc) {
      roomManager.leave(documentId, ws);
      const remaining = roomManager.getRoomSize(documentId);

      wsConnectionsActive.set(remaining);

      logger.info({ documentId, userId, remaining }, 'Client left document');

      if (remaining === 0) {
        try {
          const state = Y.encodeStateAsUpdate(ydoc);
          await persistDocument(documentId, state);
          logger.info({ documentId, bytes: state.byteLength }, 'Final flush on empty room');
        } catch (err) {
          logger.error({
            documentId,
            error: (err as Error).message,
          }, 'Final persistence failed');
        }

        const timer = persistTimers.get(documentId);
        if (timer) {
          clearTimeout(timer);
          persistTimers.delete(documentId);
        }

        ydoc.destroy();
        activeDocs.delete(documentId);
        activeDocumentsGauge.set(activeDocs.size);
        logger.info({ documentId }, 'Purged Y.Doc from memory');
      }
    }
  });

  ws.on('error', (err) => {
    logger.error({ documentId, userId, error: err.message }, 'WebSocket error');
  });
}
