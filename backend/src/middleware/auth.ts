import jwt, { JwtPayload } from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { IncomingMessage } from 'http';

export interface AuthClaims {
  sub: string;
  name: string;
  iat?: number;
  exp?: number;
}

interface AuthenticatedRequest extends Request {
  user?: AuthClaims;
}

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: JWT_SECRET environment variable must be set in production');
}
const JWT_SECRET: string = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(payload: Omit<AuthClaims, 'iat' | 'exp'>, expiresIn: any = '7d'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string): AuthClaims | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (typeof decoded.sub !== 'string' || typeof decoded.name !== 'string') {
      return null;
    }
    return { sub: decoded.sub, name: decoded.name, iat: decoded.iat, exp: decoded.exp };
  } catch (err) {
    return null;
  }
}

export function extractBearerToken(req: Request | IncomingMessage): string | null {
  const authHeader = (req.headers as Record<string, string | string[] | undefined>).authorization
    || (req.headers as Record<string, string | string[] | undefined>)['Authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing authentication token' });
    return;
  }
  const claims = verifyToken(token);
  if (!claims) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  req.user = claims;
  next();
}

export function verifyWsToken(token: string | null): AuthClaims | null {
  if (!token) return null;
  return verifyToken(token);
}
