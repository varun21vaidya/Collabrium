import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { registerUser, loginUser } from '../services/authService.js';
import { signToken } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later' },
});

router.post('/register', authLimiter, async (req: Request, res: Response) => {
  const { email, username, password, displayName } = req.body;
  try {
    const { user, token } = await registerUser(email, username, password, displayName);
    res.status(201).json({
      token,
      userId: user.id,
      name: user.displayName,
      email: user.email,
      username: user.username,
    });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes('already') ? 409 : 400;
    logger.warn({ error: message, email }, 'Registration failed');
    res.status(status).json({ error: message });
  }
});

router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body;
  try {
    const { user, token } = await loginUser(email, password);
    res.json({
      token,
      userId: user.id,
      name: user.displayName,
      email: user.email,
      username: user.username,
    });
  } catch (err) {
    const message = (err as Error).message;
    logger.warn({ error: message, email }, 'Login failed');
    res.status(401).json({ error: message });
  }
});

if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEMO === 'true') {
  router.post('/demo-token', authLimiter, async (req: Request, res: Response) => {
    const { userId, name } = req.body;
    if (!userId || !name) {
      res.status(400).json({ error: 'userId and name required' });
      return;
    }
    const token = signToken({ sub: userId, name });
    res.json({ token, userId, name });
  });
  logger.info('Demo auth endpoint enabled');
}

export default router;
