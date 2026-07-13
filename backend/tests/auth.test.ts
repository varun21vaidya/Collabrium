import { describe, it, expect } from 'vitest';
import { signToken, verifyToken, extractBearerToken } from '../src/middleware/auth.js';
import type { Request } from 'express';

describe('JWT utilities', () => {
  it('signs and verifies a token', () => {
    const token = signToken({ sub: 'user1', name: 'Alice' });
    const decoded = verifyToken(token);
    expect(decoded?.sub).toBe('user1');
    expect(decoded?.name).toBe('Alice');
  });

  it('returns null for invalid token', () => {
    expect(verifyToken('invalid-token')).toBeNull();
  });

  it('returns null for expired token', async () => {
    const token = signToken({ sub: 'user1', name: 'Alice' }, '0s');
    await new Promise((r) => setTimeout(r, 10));
    expect(verifyToken(token)).toBeNull();
  });

  it('extracts bearer token from request', () => {
    const req = { headers: { authorization: 'Bearer abc123' } } as unknown as Request;
    expect(extractBearerToken(req)).toBe('abc123');
  });

  it('returns null when no bearer token', () => {
    const req = { headers: {} } as unknown as Request;
    expect(extractBearerToken(req)).toBeNull();
  });

  it('returns null for missing Authorization header', () => {
    const req = { headers: { authorization: 'Basic abc' } } as unknown as Request;
    expect(extractBearerToken(req)).toBeNull();
  });
});
