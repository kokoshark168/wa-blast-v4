import jwt, { type SignOptions } from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'your-secret-key';
const EXPIRY = (process.env.JWT_EXPIRY || '7d') as SignOptions['expiresIn'];

export interface TokenPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, SECRET, {
    expiresIn: EXPIRY,
  });
}

export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, SECRET) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch (error) {
    return null;
  }
}
