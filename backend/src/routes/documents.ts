import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../middleware/auth.js';
import DocumentModel from '../models/Document.js';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).user.sub;
  try {
    const docs = await DocumentModel.find({
      $or: [{ ownerId: userId }, { collaboratorIds: userId }],
    })
      .select('title lastEditedAt ownerId')
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ documents: docs });
  } catch (err) {
    console.error('[Documents] List failed:', (err as Error).message);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).user.sub;
  const title = (req.body?.title || 'Untitled document').slice(0, 200);
  try {
    const doc = await DocumentModel.create({ title, ownerId: userId });
    res.status(201).json({ document: doc });
  } catch (err) {
    console.error('[Documents] Create failed:', (err as Error).message);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).user.sub;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid document ID' });
    return;
  }

  try {
    const result = await DocumentModel.deleteOne({ _id: id, ownerId: userId });
    if (result.deletedCount === 0) {
      res.status(404).json({ error: 'Document not found or unauthorized' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[Documents] Delete failed:', (err as Error).message);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
