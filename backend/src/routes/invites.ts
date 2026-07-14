import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { authMiddleware, signToken } from '../middleware/auth.js';
import InviteModel from '../models/Invite.js';
import DocumentModel from '../models/Document.js';
import { logger } from '../logger.js';

const router = Router();

const acceptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many invite accept attempts' },
});

router.post('/documents/:id/invite', authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).user.sub;
  const { id } = req.params;
  const { permissions = 'edit', expiresIn } = req.body;
  if (!mongoose.Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid document ID' }); return; }
  if (!['view', 'edit'].includes(permissions)) { res.status(400).json({ error: 'permissions must be view or edit' }); return; }
  try {
    const doc = await DocumentModel.findById(id).select('ownerId collaboratorIds title').lean();
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }
    if (doc.ownerId !== userId && !doc.collaboratorIds.includes(userId)) { res.status(403).json({ error: 'Not authorized' }); return; }
    const token = randomUUID();
    const expiresAt = expiresIn ? new Date(Date.now() + Number(expiresIn) * 3600 * 1000) : null;
    const invite = await InviteModel.create({ documentId: id, token, permissions, createdBy: userId, expiresAt });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.status(201).json({
      invite: { id: invite._id, token, permissions, expiresAt, link: `${frontendUrl}/join/${token}` },
    });
  } catch (err) {
    logger.error({ id, userId, error: (err as Error).message }, 'Invite: create failed');
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

router.get('/invite/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    const invite = await InviteModel.findOne({ token }).lean();
    if (!invite) { res.status(404).json({ error: 'Invite not found or expired' }); return; }
    if (invite.expiresAt && invite.expiresAt < new Date()) { res.status(410).json({ error: 'Invite link has expired' }); return; }
    if (invite.maxUses !== null && invite.uses >= invite.maxUses) { res.status(410).json({ error: 'Invite link has reached maximum uses' }); return; }
    const doc = await DocumentModel.findById(invite.documentId).select('title description ownerId').lean();
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }
    res.json({ documentId: invite.documentId, documentTitle: doc.title, documentDescription: doc.description, permissions: invite.permissions });
  } catch (err) {
    logger.error({ token, error: (err as Error).message }, 'Invite: get info failed');
    res.status(500).json({ error: 'Failed to get invite info' });
  }
});

router.post('/invite/:token/accept', acceptLimiter, async (req: Request, res: Response) => {
  const { token } = req.params;
  const { userId, name } = req.body;
  if (!userId || typeof userId !== 'string' || !name || typeof name !== 'string') {
    res.status(400).json({ error: 'userId and name are required' }); return;
  }
  try {
    const invite = await InviteModel.findOne({ token });
    if (!invite) { res.status(404).json({ error: 'Invite not found' }); return; }
    if (invite.expiresAt && invite.expiresAt < new Date()) { res.status(410).json({ error: 'Invite link has expired' }); return; }
    if (invite.maxUses !== null && invite.uses >= invite.maxUses) { res.status(410).json({ error: 'Invite link has reached maximum uses' }); return; }
    const doc = await DocumentModel.findById(invite.documentId).select('ownerId collaboratorIds title');
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }
    if (doc.ownerId !== userId) {
      await DocumentModel.findByIdAndUpdate(invite.documentId, { $addToSet: { collaboratorIds: userId } });
    }
    invite.uses += 1;
    await invite.save();
    const jwtToken = signToken({ sub: userId, name });
    logger.info({ token, userId, documentId: invite.documentId.toString() }, 'Invite accepted');
    res.json({ token: jwtToken, userId, name, documentId: invite.documentId, permissions: invite.permissions });
  } catch (err) {
    logger.error({ token, error: (err as Error).message }, 'Invite: accept failed');
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

export default router;
