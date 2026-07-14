import mongoose, { Schema, Model } from 'mongoose';

export interface IDocumentHistory extends mongoose.Document {
  documentId: mongoose.Types.ObjectId;
  snapshot: Buffer;
  authorId: string;
  message: string;
  createdAt: Date;
}

const DocumentHistorySchema = new Schema({
  documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
  snapshot: { type: Buffer, required: true },
  authorId: { type: String, default: '' },
  message: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true },
});

DocumentHistorySchema.index({ documentId: 1, createdAt: -1 });

const DocumentHistoryModel: Model<IDocumentHistory> = mongoose.model<IDocumentHistory>(
  'DocumentHistory',
  DocumentHistorySchema
);
export default DocumentHistoryModel;
