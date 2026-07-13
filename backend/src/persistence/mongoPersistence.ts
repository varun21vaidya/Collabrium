import DocumentModel from '../models/Document.js';

export async function loadDocument(documentId: string): Promise<Uint8Array | null> {
  try {
    const doc = await DocumentModel.findById(documentId).select('yjsState').lean();
    if (!doc || !doc.yjsState) return null;
    return new Uint8Array(doc.yjsState.buffer, doc.yjsState.byteOffset, doc.yjsState.byteLength);
  } catch (err) {
    console.error(`[Persistence] Load failed for ${documentId}:`, (err as Error).message);
    return null;
  }
}

export async function persistDocument(documentId: string, stateUpdate: Uint8Array): Promise<void> {
  try {
    await DocumentModel.findByIdAndUpdate(
      documentId,
      {
        yjsState: Buffer.from(stateUpdate.buffer, stateUpdate.byteOffset, stateUpdate.byteLength),
        lastEditedAt: new Date(),
      },
      { upsert: false }
    );
  } catch (err) {
    console.error(`[Persistence] Save failed for ${documentId}:`, (err as Error).message);
    throw err;
  }
}
