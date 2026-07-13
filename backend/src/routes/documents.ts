import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../middleware/auth.js';
import DocumentModel from '../models/Document.js';

const router = Router();

const PAGE_SIZE = 50;

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).user.sub;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  try {
    const filter = {
      $or: [{ ownerId: userId }, { collaboratorIds: userId }],
    };
    const [docs, total] = await Promise.all([
      DocumentModel.find(filter)
        .select('title lastEditedAt ownerId')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      DocumentModel.countDocuments(filter),
    ]);
    res.json({
      documents: docs,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        hasMore: page * PAGE_SIZE < total,
      },
    });
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
