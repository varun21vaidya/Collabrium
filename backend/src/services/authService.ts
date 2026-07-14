import bcrypt from 'bcrypt';
import UserModel, { IUser } from '../models/User.js';
import { signToken } from '../middleware/auth.js';

const SALT_ROUNDS = 10;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

export async function registerUser(
  email: string,
  username: string,
  password: string,
  displayName: string
): Promise<{ user: IUser; token: string }> {
  if (!email || !username || !password || !displayName) {
    throw new Error('All fields are required');
  }
  if (!isValidEmail(email)) {
    throw new Error('Invalid email address');
  }
  if (!isValidPassword(password)) {
    throw new Error('Password must be at least 8 characters');
  }
  if (username.length < 3) {
    throw new Error('Username must be at least 3 characters');
  }
  if (displayName.length < 1) {
    throw new Error('Display name is required');
  }

  const existing = await UserModel.findOne({
    $or: [{ email: email.toLowerCase() }, { username: username.trim() }],
  });
  if (existing) {
    if (existing.email === email.toLowerCase()) {
      throw new Error('Email already registered');
    }
    if (existing.username === username.trim()) {
      throw new Error('Username already taken');
    }
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = new UserModel({
    email: email.toLowerCase(),
    username: username.trim(),
    passwordHash,
    displayName: displayName.trim(),
  });
  await user.save();

  const token = signToken({ sub: user.id, name: user.displayName });
  return { user, token };
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ user: IUser; token: string }> {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const user = await UserModel.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new Error('Invalid email or password');
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    throw new Error('Invalid email or password');
  }

  const token = signToken({ sub: user.id, name: user.displayName });
  return { user, token };
}
