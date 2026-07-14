import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../middleware/auth.js';
import DocumentModel from '../models/Document.js';
import { logger } from '../logger.js';

const router = Router();
const PAGE_SIZE = 50;

function sanitizeTitle(title: unknown): string {
  if (typeof title !== 'string') return 'Untitled document';
  return title.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 200) || 'Untitled document';
}

function sanitizeDescription(desc: unknown): string {
  if (typeof desc !== 'string') return '';
  return desc.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 500);
}

async function requireDocumentAccess(documentId: string, userId: string, writeAccess = false): Promise<boolean> {
  const doc = await DocumentModel.findById(documentId).select('ownerId collaboratorIds').lean();
  if (!doc) return false;
  if (doc.ownerId === userId) return true;
  if (!writeAccess && doc.collaboratorIds.includes(userId)) return true;
  return false;
}

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).user.sub;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const sortBy = ['lastEditedAt', 'title', 'createdAt'].includes(req.query.sortBy as string)
    ? (req.query.sortBy as string)
    : 'updatedAt';
  const order = req.query.order === 'asc' ? 1 : -1;
  const search = typeof req.query.search === 'string' && req.query.search.trim()
    ? req.query.search.trim()
    : null;

  try {
    const baseFilter: any = { $or: [{ ownerId: userId }, { collaboratorIds: userId }] };
    const filter = search ? { ...baseFilter, $text: { $search: search } } : baseFilter;

    const [docs, total] = await Promise.all([
      DocumentModel.find(filter)
        .select('title description lastEditedAt ownerId createdAt')
        .sort({ [sortBy]: order })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      DocumentModel.countDocuments(filter),
    ]);
    res.json({
      documents: docs,
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE), hasMore: page * PAGE_SIZE < total },
    });
  } catch (err) {
    logger.error({ userId, error: (err as Error).message }, 'Documents: list failed');
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).user.sub;
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid document ID' }); return; }
  try {
    const hasAccess = await requireDocumentAccess(id, userId);
    if (!hasAccess) { res.status(404).json({ error: 'Document not found' }); return; }
    const doc = await DocumentModel.findById(id).select('title description lastEditedAt ownerId collaboratorIds').lean();
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }
    res.json({ document: doc });
  } catch (err) {
    logger.error({ id, userId, error: (err as Error).message }, 'Documents: get failed');
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).user.sub;
  const title = sanitizeTitle(req.body?.title);
  const description = sanitizeDescription(req.body?.description);
  try {
    const doc = await DocumentModel.create({ title, description, ownerId: userId });
    res.status(201).json({ document: doc });
  } catch (err) {
    logger.error({ userId, error: (err as Error).message }, 'Documents: create failed');
    res.status(500).json({ error: 'Failed to create document' });
  }
});

router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).user.sub;
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid document ID' }); return; }
  const updates: any = {};
  if (req.body?.title !== undefined) updates.title = sanitizeTitle(req.body.title);
  if (req.body?.description !== undefined) updates.description = sanitizeDescription(req.body.description);
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
  try {
    const hasAccess = await requireDocumentAccess(id, userId);
    if (!hasAccess) { res.status(404).json({ error: 'Document not found' }); return; }
    const doc = await DocumentModel.findByIdAndUpdate(id, updates, { new: true }).select('title description lastEditedAt ownerId');
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }
    res.json({ document: doc });
  } catch (err) {
    logger.error({ id, userId, error: (err as Error).message }, 'Documents: update failed');
    res.status(500).json({ error: 'Failed to update document' });
  }
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).user.sub;
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid document ID' }); return; }
  try {
    const result = await DocumentModel.deleteOne({ _id: id, ownerId: userId });
    if (result.deletedCount === 0) { res.status(404).json({ error: 'Document not found or unauthorized' }); return; }
    res.json({ success: true });
  } catch (err) {
    logger.error({ id, userId, error: (err as Error).message }, 'Documents: delete failed');
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

router.post('/:id/collaborators', authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).user.sub;
  const { id } = req.params;
  const { collaboratorId } = req.body;
  if (!mongoose.Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid document ID' }); return; }
  if (!collaboratorId || typeof collaboratorId !== 'string') { res.status(400).json({ error: 'collaboratorId is required' }); return; }
  try {
    const doc = await DocumentModel.findOneAndUpdate(
      { _id: id, ownerId: userId },
      { $addToSet: { collaboratorIds: collaboratorId } },
      { new: true }
    ).select('title ownerId collaboratorIds');
    if (!doc) { res.status(404).json({ error: 'Document not found or not authorized' }); return; }
    res.json({ document: doc });
  } catch (err) {
    logger.error({ id, userId, error: (err as Error).message }, 'Documents: add collaborator failed');
    res.status(500).json({ error: 'Failed to add collaborator' });
  }
});

router.delete('/:id/collaborators/:collaboratorId', authMiddleware, async (req: Request, res: Response) => {
  const userId = (req as any).user.sub;
  const { id, collaboratorId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) { res.status(400).json({ error: 'Invalid document ID' }); return; }
  try {
    const doc = await DocumentModel.findOneAndUpdate(
      { _id: id, ownerId: userId },
      { $pull: { collaboratorIds: collaboratorId } },
      { new: true }
    ).select('title ownerId collaboratorIds');
    if (!doc) { res.status(404).json({ error: 'Document not found or not authorized' }); return; }
    res.json({ document: doc });
  } catch (err) {
    logger.error({ id, userId, error: (err as Error).message }, 'Documents: remove collaborator failed');
    res.status(500).json({ error: 'Failed to remove collaborator' });
  }
});

export default router;
