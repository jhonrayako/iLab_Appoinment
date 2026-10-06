const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getClientIp } = require('../utils/audit');
const authService = require('../services/authService');

/**
 * POST /auth/register
 * Backward-compatible alias for visitor registration used by the frontend
 */
router.post(
  '/register',
  [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').optional().trim().notEmpty().withMessage('First name is required'),
    body('lastName').optional().trim().notEmpty().withMessage('Last name is required'),
    body('first_name').optional().trim().notEmpty().withMessage('First name is required'),
    body('last_name').optional().trim().notEmpty().withMessage('Last name is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const username = req.body.username;
    const email = req.body.email;
    const password = req.body.password;
    const firstName = req.body.firstName ?? req.body.first_name;
    const lastName = req.body.lastName ?? req.body.last_name;

    const user = await authService.registerVisitor({ username, email, password, firstName, lastName });
    const result = await authService.login({ username, password, role: 'Visitor' });

    res.status(201).json({ success: true, token: result.token, user: result.user });
  })
);

/**
 * POST /auth/visitor/register
 * Register a new visitor account
 */
router.post(
  '/visitor/register',
  [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').optional().trim().notEmpty().withMessage('First name is required'),
    body('lastName').optional().trim().notEmpty().withMessage('Last name is required'),
    body('first_name').optional().trim().notEmpty().withMessage('First name is required'),
    body('last_name').optional().trim().notEmpty().withMessage('Last name is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { username, email, password } = req.body;
    const firstName = req.body.firstName ?? req.body.first_name;
    const lastName = req.body.lastName ?? req.body.last_name;
    const user = await authService.registerVisitor({ username, email, password, firstName, lastName });
    const result = await authService.login({ username, password, role: 'Visitor' });

    res.status(201).json({ success: true, token: result.token, user: result.user });
  })
);

/**
 * POST /auth/login
 * Backward-compatible alias used by the frontend for visitor login
 */
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { username, password } = req.body;
    const result = await authService.login({ username, password, role: 'Visitor' });

    res.status(200).json({ success: true, token: result.token, user: result.user });
  })
);

/**
 * POST /auth/visitor/login
 * Visitor login endpoint
 */
router.post(
  '/visitor/login',
  [
    body('username').trim().notEmpty().withMessage('Username required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { username, password } = req.body;
    const result = await authService.login({ username, password, role: 'Visitor' });

    res.status(200).json({ success: true, token: result.token, user: result.user });
  })
);

/**
 * POST /auth/admin/login
 * Admin login endpoint (Admin role only)
 */
router.post(
  '/staff/login',
  [
    body('username').trim().notEmpty().withMessage('Username required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { username, password } = req.body;
    const result = await authService.login({ username, password, role: 'Staff' });

    res.status(200).json({ success: true, token: result.token, user: result.user });
  })
);

router.post(
  '/admin/login',
  [
    body('username').trim().notEmpty().withMessage('Username required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { username, password } = req.body;
    const result = await authService.login({ username, password, role: 'Admin' });

    res.status(200).json({ success: true, token: result.token, user: result.user });
  })
);

/**
 * POST /auth/password-reset/request
 */
router.post(
  '/password-reset/request',
  [body('email').isEmail().normalizeEmail().withMessage('Invalid email')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const result = await authService.requestPasswordReset({ email: req.body.email });

    res.status(200).json(result);
  })
);

router.post(
  '/password-reset/confirm',
  [
    body('token').notEmpty().withMessage('Reset token required'),
    body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0].msg);
    const result = await authService.resetPassword({ token: req.body.token, newPassword: req.body.newPassword });
    res.status(200).json({ success: true, ...result });
  })
);

/**
 * GET /auth/me
 * Get current authenticated user
 */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await authService.getCurrentUser(req.user.sub);
    res.status(200).json({ success: true, user });
  })
);

module.exports = router;
