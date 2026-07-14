import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../middleware/auth.js';
import DocumentHistoryModel from '../models/DocumentHistory.js';
import DocumentModel from '../models/Document.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/:id/history', authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).user.sub;
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid document ID' }); return; }
  try {
    const doc = await DocumentModel.findById(id).select('ownerId collaboratorIds').lean();
    if (!doc || (doc.ownerId !== userId && !doc.collaboratorIds.includes(userId))) {
      res.status(404).json({ error: 'Document not found' }); return;
    }
    const versions = await DocumentHistoryModel.find({ documentId: id })
      .sort({ createdAt: -1 }).select('_id authorId message createdAt').limit(50).lean();
    res.json({ versions });
  } catch (err) {
    logger.error({ id, error: (err as Error).message }, 'History: list failed');
    res.status(500).json({ error: 'Failed to list history' });
  }
});

router.post('/:id/restore', authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).user.sub;
  const { id } = req.params;
  const { versionId } = req.body;
  if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(versionId)) {
    res.status(400).json({ error: 'Invalid ID' }); return;
  }
  try {
    const doc = await DocumentModel.findById(id).select('ownerId collaboratorIds').lean();
    if (!doc || (doc.ownerId !== userId && !doc.collaboratorIds.includes(userId))) {
      res.status(404).json({ error: 'Document not found' }); return;
    }
    const version = await DocumentHistoryModel.findOne({ _id: versionId, documentId: id });
    if (!version) { res.status(404).json({ error: 'Version not found' }); return; }
    await DocumentModel.findByIdAndUpdate(id, { yjsState: version.snapshot, lastEditedAt: new Date(), lastEditedBy: userId });
    logger.info({ id, versionId, userId }, 'Document restored to version');
    res.json({ success: true, message: 'Document restored. Reconnect to see the changes.' });
  } catch (err) {
    logger.error({ id, error: (err as Error).message }, 'History: restore failed');
    res.status(500).json({ error: 'Failed to restore document' });
  }
});

export default router;
