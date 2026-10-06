const { verifyToken } = require('../utils/jwt');
const { HttpError } = require('./errorHandler');
const { query } = require('../config/db');

const normalizeRoleName = (roleName) => String(roleName ?? '').trim().toLowerCase();

/**
 * Middleware: Verify JWT and attach user to req
 */
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Missing or invalid authorization header'));
  }

  const token = authHeader.substring(7);

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    next(new HttpError(401, 'Invalid or expired token'));
  }
};

/**
 * Middleware: Check user role(s)
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new HttpError(401, 'Unauthorized'));
    }

    const requiredRoles = allowedRoles.map(normalizeRoleName);
    const userRole = normalizeRoleName(req.user.role_name ?? req.user.role ?? req.user.roleName);

    if (!requiredRoles.includes(userRole)) {
      return next(new HttpError(403, 'Forbidden: insufficient permissions'));
    }

    next();
  };
};

/**
 * Optional auth: Attach user if token is provided, but don't require it
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = verifyToken(token);
      req.user = decoded;
    } catch (error) {
      // Silently ignore invalid tokens in optional mode
    }
  }

  next();
};

module.exports = {
  requireAuth,
  requireRole,
  optionalAuth,
};
