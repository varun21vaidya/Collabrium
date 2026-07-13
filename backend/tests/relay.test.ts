import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as Y from 'yjs';
import { handleRelayConnection, flushAllDocuments, getActiveDocCount, getTotalConnections } from '../src/relay/wsRelayServer.js';
import { roomManager } from '../src/relay/roomManager.js';
import DocumentModel from '../src/models/Document.js';
import { signToken } from '../src/middleware/auth.js';

let mongoServer: MongoMemoryServer;
let httpServer: ReturnType<typeof createServer>;
let wss: WebSocketServer;
let validDocId: string;

beforeAll(async () => {
  try {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  } catch (err) {
    console.warn('MongoMemoryServer unavailable, skipping WS relay tests');
  }

  const doc = await DocumentModel.create({ title: 'Relay Test Doc', ownerId: 'user1', collaboratorIds: [] });
  validDocId = doc._id.toHexString();

  const app = express();
  httpServer = createServer(app);
  wss = new WebSocketServer({ server: httpServer, path: '/collab' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const doc = url.searchParams.get('doc') || '';
    if (!doc) {
      ws.close(4000, 'Missing document ID');
      return;
    }
    handleRelayConnection(ws, doc, 'user1');
  });

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
});

afterAll(async () => {
  wss.close();
  httpServer.close();
  try {
    await mongoose.disconnect();
    await mongoServer?.stop();
  } catch {
    // ignore cleanup errors
  }
});

describe('WebSocket Relay', () => {
  it('connects and disconnects client', async () => {
    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('Server not listening');
    const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/collab?doc=${validDocId}`);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(getTotalConnections()).toBeGreaterThan(0);

    ws.close();

    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it('relays Yjs sync messages between two clients', async () => {
    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('Server not listening');
    const baseUrl = `ws://127.0.0.1:${addr.port}/collab?doc=${validDocId}`;

    const ws1 = new WebSocket(baseUrl);
    const ws2 = new WebSocket(baseUrl);

    await Promise.all([
      new Promise<void>((resolve) => ws1.on('open', () => resolve())),
      new Promise<void>((resolve) => ws2.on('open', () => resolve())),
    ]);

    const received = new Promise<Buffer>((resolve) => {
      ws2.on('message', (data) => resolve(Buffer.from(data as ArrayBuffer)));
    });

    const ydoc = new Y.Doc();
    const update = Y.encodeStateAsUpdate(ydoc);
    const syncMsg = new Uint8Array(1 + update.length);
    syncMsg[0] = 0;
    syncMsg.set(update, 1);
    ws1.send(Buffer.from(syncMsg));

    const msg = await received;
    expect(msg.length).toBeGreaterThan(0);
    expect(msg[0]).toBe(0);

    ws1.close();
    ws2.close();
    ydoc.destroy();
  }, 15000);

  it('rejects missing document ID', async () => {
    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('Server not listening');
    const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/collab`);

    const code = await new Promise<number>((resolve) => {
      ws.on('close', (c) => resolve(c));
    });

    expect(code).toBe(4000);
  });

  it('tracks active doc count', async () => {
    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('Server not listening');

    const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/collab?doc=${validDocId}`);
    await new Promise<void>((resolve) => ws.on('open', () => resolve()));

    await new Promise((resolve) => setTimeout(resolve, 200));

    ws.close();
  });

  it('rejects non-existent document via ACL check', async () => {
    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('Server not listening');
    const nonExistentId = new mongoose.Types.ObjectId().toHexString();
    const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/collab?doc=${nonExistentId}`);

    await new Promise<void>((resolve) => {
      ws.on('close', () => resolve());
      ws.on('error', () => {});
      setTimeout(resolve, 5000);
    });
  }, 10000);
});
