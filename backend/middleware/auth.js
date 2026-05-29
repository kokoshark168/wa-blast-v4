/**
 * Auth Middleware - JWT token verification
 */
import jwt from 'jsonwebtoken';
import pino from 'pino';

const logger = pino();

export function verifyAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');

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
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      req.state = req.state || {};
      req.state.userId = decoded.userId;
      req.state.username = decoded.username;
    }
  } catch (error) {
    // Ignore auth errors for optional auth
  }

  next();
}
