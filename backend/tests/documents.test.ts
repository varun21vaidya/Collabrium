import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import documentsRouter from '../src/routes/documents.js';
import { signToken } from '../src/middleware/auth.js';

let mongoServer: MongoMemoryServer;
let app: express.Express;
let token: string;

beforeAll(async () => {
  try {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  } catch (err) {
    console.warn('MongoMemoryServer unavailable, skipping MongoDB tests');
  }

  app = express();
  app.use(express.json());
  app.use('/api/documents', documentsRouter);

  token = signToken({ sub: 'user1', name: 'Alice' });
});

afterAll(async () => {
  try {
    await mongoose.disconnect();
    await mongoServer?.stop();
  } catch {
    // ignore cleanup errors
  }
});

describe('Documents API', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/documents');
    expect(res.status).toBe(401);
  });

  it('rejects invalid document IDs for delete', async () => {
    const res = await request(app)
      .delete('/api/documents/not-an-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('creates a document', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test Doc' });

    expect(res.status).toBe(201);
    expect(res.body.document.title).toBe('Test Doc');
    expect(res.body.document.ownerId).toBe('user1');
  });

  it('sets default title for empty title', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.document.title).toBe('Untitled document');
  });

  it('lists user documents', async () => {
    const res = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.documents.length).toBeGreaterThan(0);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBeGreaterThan(0);
  });

  it('renames a document', async () => {
    const createRes = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Original' });

    const docId = createRes.body.document._id;

    const renameRes = await request(app)
      .patch(`/api/documents/${docId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Renamed' });

    expect(renameRes.status).toBe(200);
    expect(renameRes.body.document.title).toBe('Renamed');
  });
});
