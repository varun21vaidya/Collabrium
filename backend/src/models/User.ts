import mongoose, { Schema, Model, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  username: string;
  passwordHash: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true },
  },
  { timestamps: true }
);

const UserModel: Model<IUser> = mongoose.model<IUser>('User', UserSchema);
export default UserModel;
