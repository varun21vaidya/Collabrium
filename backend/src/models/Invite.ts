import mongoose, { Schema, Model } from 'mongoose';

export interface IInvite extends mongoose.Document {
  documentId: mongoose.Types.ObjectId;
  token: string;
  permissions: 'view' | 'edit';
  createdBy: string;
  expiresAt: Date | null;
  maxUses: number | null;
  uses: number;
  createdAt: Date;
}

const InviteSchema = new Schema({
  documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
  token: { type: String, unique: true, required: true, index: true },
  permissions: { type: String, enum: ['view', 'edit'], default: 'edit' },
  createdBy: { type: String, required: true },
  expiresAt: { type: Date, default: null },
  maxUses: { type: Number, default: null },
  uses: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const InviteModel: Model<IInvite> = mongoose.model<IInvite>('Invite', InviteSchema);
export default InviteModel;
