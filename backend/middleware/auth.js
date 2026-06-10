/**
 * Auth Middleware - JWT token verification
 */
import jwt from 'jsonwebtoken';
import pino from 'pino';

const logger = pino();

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  // SECURITY: never fall back to a hardcoded secret — that would let anyone forge tokens.
  if (!secret || secret.length < 16) {
    return null;
  }
  return secret;
}

export function verifyAuth(req, res, next) {
  try {
    const secret = getJwtSecret();
    if (!secret) {
      logger.error('JWT_SECRET is not configured (min 16 chars). Refusing to authenticate.');
      return res.status(500).json({ error: 'Server authentication is not configured' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, secret);

    if (decoded.userId === undefined || decoded.userId === null) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    req.state = req.state || {};
    req.state.userId = decoded.userId;
    req.state.username = decoded.username;

    next();
  } catch (error) {
    logger.warn(`Auth error: ${error.message}`);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuth(req, res, next) {
  try {
    const secret = getJwtSecret();
    const authHeader = req.headers.authorization;
    if (secret && authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, secret);
      req.state = req.state || {};
      req.state.userId = decoded.userId;
      req.state.username = decoded.username;
    }
  } catch (error) {
    // Ignore auth errors for optional auth
  }

  next();
}
