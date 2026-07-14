import DocumentModel from '../models/Document.js';
import DocumentHistoryModel from '../models/DocumentHistory.js';
import { logger } from '../logger.js';

const persistCounts: Map<string, number> = new Map();
const lastHistorySnap: Map<string, number> = new Map();
const HISTORY_EVERY_N = 5;
const HISTORY_MIN_INTERVAL_MS = 5 * 60 * 1000;

export async function loadDocument(documentId: string): Promise<Uint8Array | null> {
  try {
    const doc = await DocumentModel.findById(documentId).select('yjsState').lean();
    if (!doc || !doc.yjsState) return null;
    return new Uint8Array(doc.yjsState.buffer, doc.yjsState.byteOffset, doc.yjsState.byteLength);
  } catch (err) {
    logger.error({ documentId, error: (err as Error).message }, 'Persistence: load failed');
    return null;
  }
}

export async function persistDocument(
  documentId: string,
  stateUpdate: Uint8Array,
  authorId = ''
): Promise<void> {
  try {
    await DocumentModel.findByIdAndUpdate(
      documentId,
      {
        yjsState: Buffer.from(stateUpdate.buffer, stateUpdate.byteOffset, stateUpdate.byteLength),
        lastEditedAt: new Date(),
        ...(authorId ? { lastEditedBy: authorId } : {}),
      },
      { upsert: false }
    );

    const count = (persistCounts.get(documentId) || 0) + 1;
    persistCounts.set(documentId, count);
    const lastSnap = lastHistorySnap.get(documentId) || 0;
    const now = Date.now();
    const shouldSnap = count % HISTORY_EVERY_N === 0 || now - lastSnap >= HISTORY_MIN_INTERVAL_MS;

    if (shouldSnap) {
      lastHistorySnap.set(documentId, now);
      try {
        await DocumentHistoryModel.create({
          documentId,
          snapshot: Buffer.from(stateUpdate.buffer, stateUpdate.byteOffset, stateUpdate.byteLength),
          authorId,
          message: '',
        });
        const entries = await DocumentHistoryModel.find({ documentId })
          .sort({ createdAt: -1 })
          .skip(50)
          .select('_id');
        if (entries.length > 0) {
          const ids = entries.map((e) => e._id);
          await DocumentHistoryModel.deleteMany({ _id: { $in: ids } });
        }
      } catch (histErr) {
        logger.warn({ documentId, error: (histErr as Error).message }, 'History snapshot failed');
      }
    }
  } catch (err) {
    logger.error({ documentId, error: (err as Error).message }, 'Persistence: save failed');
    throw err;
  }
}
