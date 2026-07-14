import mongoose, { Schema, Document as MongooseDocument, Model } from 'mongoose';

export interface ICollabDocument extends MongooseDocument {
  title: string;
  description: string;
  ownerId: string;
  collaboratorIds: string[];
  yjsState: Buffer;
  lastEditedAt: Date;
  lastEditedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema(
  {
    title: { type: String, default: 'Untitled document', trim: true },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    ownerId: { type: String, required: true, index: true },
    collaboratorIds: { type: [String], default: [], index: true },
    yjsState: { type: Buffer },
    lastEditedAt: { type: Date, default: () => new Date() },
    lastEditedBy: { type: String },
  },
  { timestamps: true }
);

DocumentSchema.index({ ownerId: 1, updatedAt: -1 });
DocumentSchema.index({ collaboratorIds: 1, updatedAt: -1 });
DocumentSchema.index({ lastEditedAt: -1 });
DocumentSchema.index({ title: 'text' });

const DocumentModel: Model<ICollabDocument> = mongoose.model<ICollabDocument>(
  'Document',
  DocumentSchema
);

export default DocumentModel;
