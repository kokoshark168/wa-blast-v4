import jwt, { type SignOptions } from 'jsonwebtoken';

const MIN_SECRET_LENGTH = 32;

/**
 * Resolve the JWT signing secret. In production a strong secret is mandatory —
 * we fail closed rather than silently signing tokens with a known default.
 * In development/test a deterministic fallback keeps local DX frictionless.
 */
function resolveSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters in production`
      );
    }
    return secret;
  }
  return secret || 'alphaflow-dev-only-secret-do-not-use-in-prod';
}

const EXPIRY = (process.env.JWT_EXPIRY || '7d') as SignOptions['expiresIn'];

export interface TokenPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, resolveSecret(), {
    expiresIn: EXPIRY,
  });
}

export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, resolveSecret()) as TokenPayload;
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
