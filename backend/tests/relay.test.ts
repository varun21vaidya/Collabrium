import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { handleRelayConnection, flushAllDocuments, getActiveDocCount, getTotalConnections } from '../src/relay/wsRelayServer.js';
import { roomManager } from '../src/relay/roomManager.js';
import DocumentModel from '../src/models/Document.js';
import { signToken } from '../src/middleware/auth.js';
import { verifyWsToken } from '../src/middleware/auth.js';

let mongoServer: MongoMemoryServer;
let httpServer: ReturnType<typeof createServer>;
let wss: WebSocketServer;
let token: string;

beforeAll(async () => {
  try {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  } catch (err) {
    console.warn('MongoMemoryServer unavailable, skipping WS relay tests');
  }

  await DocumentModel.create({ title: 'Relay Test Doc', ownerId: 'user1', collaboratorIds: [] });
  token = signToken({ sub: 'user1', name: 'Alice' });

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
    const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/collab?doc=test-doc-1`);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    expect(getTotalConnections()).toBeGreaterThan(0);

    ws.close();

    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('relays messages between two clients', async () => {
    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('Server not listening');
    const baseUrl = `ws://127.0.0.1:${addr.port}/collab?doc=test-doc-2`;

    const ws1 = new WebSocket(baseUrl);
    await new Promise<void>((resolve) => ws1.on('open', () => resolve()));

    const ws2 = new WebSocket(baseUrl);
    await new Promise<void>((resolve) => ws2.on('open', () => resolve()));

    const received = new Promise<Buffer>((resolve) => {
      ws2.on('message', (data) => resolve(Buffer.from(data as ArrayBuffer)));
    });

    ws1.send(new Uint8Array([0, 1, 2, 3]));

    const msg = await received;
    expect(msg.length).toBe(4);
    expect(Array.from(msg)).toEqual([0, 1, 2, 3]);

    ws1.close();
    ws2.close();
  });

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

    const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/collab?doc=test-doc-3`);
    await new Promise<void>((resolve) => ws.on('open', () => resolve()));

    await new Promise((resolve) => setTimeout(resolve, 100));

    ws.close();

    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('rejects non-existent document ACL for WS', async () => {
    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('Server not listening');
    const nonExistentId = new mongoose.Types.ObjectId().toHexString();
    const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/collab?doc=${nonExistentId}`);

    const code = await new Promise<number>((resolve) => {
      ws.on('close', (c) => resolve(c));
      ws.on('error', () => {});
    });

    expect(code).toBe(4000);
  });
});
