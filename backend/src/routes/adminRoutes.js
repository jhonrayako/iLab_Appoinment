const express = require('express');
const { body, query: queryValidator, validationResult } = require('express-validator');
const router = express.Router();
const { query, withTransaction } = require('../config/db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getClientIp } = require('../utils/audit');
const appointmentsService = require('../services/appointmentsService');
const analyticsService = require('../services/analyticsService');
const feedbackService = require('../services/feedbackService');
const userRoleService = require('../services/userRoleService');
const facilityService = require('../services/facilityService');
const auditService = require('../services/auditService');
const { getRecentAppointmentNotifications } = require('../services/notificationsService');

router.get(
  '/notifications',
  requireAuth,
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const notifications = await getRecentAppointmentNotifications();
    res.status(200).json({ success: true, notifications });
  })
);

router.get(
  '/content/site',
  requireAuth,
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const result = await query(
    `SELECT content FROM site_content WHERE page_key IN ('home', 'about', 'contact') ORDER BY page_key`
    );
  const content = Object.assign({}, ...result.rows.map((row) => row.content || {}));
  res.status(200).json({ success: true, content });
  })
);

router.put(
  '/content/site',
  requireAuth,
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const incoming = req.body || {};
    const allowedKeys = ['hero_title', 'hero_description', 'mission_title', 'mission_summary', 'phone_number', 'email_address', 'location'];
    const updates = Object.fromEntries(
      Object.entries(incoming)
        .filter(([key]) => allowedKeys.includes(key))
        .map(([key, value]) => [key, String(value)])
    );

    if (Object.keys(updates).length === 0) {
      throw new HttpError(400, 'No valid content keys were provided');
    }

    const keyPages = {
      hero_title: 'home',
      hero_description: 'home',
      mission_title: 'about',
      mission_summary: 'about',
      phone_number: 'contact',
      email_address: 'contact',
      location: 'contact',
    };
    const pageUpdates = ['home', 'about', 'contact'].map((pageKey) => [
      pageKey,
      Object.fromEntries(Object.entries(updates).filter(([key]) => keyPages[key] === pageKey)),
    ]).filter(([, content]) => Object.keys(content).length > 0);

    await withTransaction(async (client) => {
      for (const [pageKey, content] of pageUpdates) {
        await client.query(
          `INSERT INTO site_content (page_key, content, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (page_key)
           DO UPDATE SET
             content = COALESCE(site_content.content, '{}'::jsonb) || EXCLUDED.content,
             updated_at = NOW()`,
          [pageKey, JSON.stringify(content)]
        );
      }
    });

    const result = await query(
      `SELECT content FROM site_content WHERE page_key IN ('home', 'about', 'contact') ORDER BY page_key`
    );
    const content = Object.assign({}, ...result.rows.map((row) => row.content || {}));
    res.status(200).json({ success: true, content });
  })
);

router.get(
  '/content/slides',
  requireAuth,
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT slide_id, title, description, image_url, image_data, is_active, sort_order, created_at, updated_at
       FROM homepage_slides
       ORDER BY sort_order ASC, created_at DESC`
    );
    res.status(200).json({ success: true, slides: result.rows });
  })
);

router.post(
  '/content/slides',
  requireAuth,
  requireRole('Admin'),
  [
    body('title').trim().notEmpty().withMessage('Title required'),
    body('description').trim().notEmpty().withMessage('Description required'),
    body('imageUrl').optional().trim(),
    body('imageData').optional().trim(),
    body('sortOrder').optional().isInt({ min: 0 }),
    body('isActive').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0].msg);

    const { title, description, imageUrl, imageData, sortOrder = 0, isActive = true } = req.body;
    if (!imageUrl && !imageData) {
      throw new HttpError(400, 'Slide image is required');
    }

    const result = await query(
      `INSERT INTO homepage_slides (title, description, image_url, image_data, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING slide_id, title, description, image_url, image_data, is_active, sort_order, created_at, updated_at`,
      [title, description, imageUrl || null, imageData || null, isActive, sortOrder]
    );

    res.status(201).json({ success: true, slide: result.rows[0] });
  })
);

router.put(
  '/content/slides/:id',
  requireAuth,
  requireRole('Admin'),
  [
    body('title').optional().trim().notEmpty(),
    body('description').optional().trim().notEmpty(),
    body('imageUrl').optional().trim(),
    body('imageData').optional().trim(),
    body('sortOrder').optional().isInt({ min: 0 }),
    body('isActive').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0].msg);

    const { title, description, imageUrl, imageData, sortOrder, isActive } = req.body;
    const updates = [];
    const values = [];
    let index = 1;

    for (const [field, value] of [['title', title], ['description', description], ['image_url', imageUrl], ['image_data', imageData], ['sort_order', sortOrder], ['is_active', isActive]]) {
      if (value !== undefined) {
        updates.push(`${field} = $${index}`);
        values.push(value);
        index++;
      }
    }

    if (updates.length === 0) {
      throw new HttpError(400, 'At least one field is required');
    }

    updates.push('updated_at = NOW()');
    values.push(req.params.id);
    const result = await query(
      `UPDATE homepage_slides
       SET ${updates.join(', ')}
       WHERE slide_id = $${index}
       RETURNING slide_id, title, description, image_url, image_data, is_active, sort_order, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) throw new HttpError(404, 'Slide not found');
    res.status(200).json({ success: true, slide: result.rows[0] });
  })
);

router.delete(
  '/content/slides/:id',
  requireAuth,
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const result = await query(
      `DELETE FROM homepage_slides WHERE slide_id = $1 RETURNING slide_id`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new HttpError(404, 'Slide not found');
    res.status(200).json({ success: true, message: 'Slide deleted' });
  })
);

router.get(
  '/content/announcements',
  requireAuth,
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT announcement_id, label, title, detail, is_published, created_at, updated_at
       FROM announcements
       ORDER BY created_at DESC`
    );
    res.status(200).json({ success: true, announcements: result.rows });
  })
);

router.post(
  '/content/announcements',
  requireAuth,
  requireRole('Admin'),
  [
    body('label').trim().notEmpty().withMessage('Label required'),
    body('title').trim().notEmpty().withMessage('Title required'),
    body('detail').trim().notEmpty().withMessage('Details required'),
    body('isPublished').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0].msg);

    const { label, title, detail, isPublished = false } = req.body;
    const result = await query(
      `INSERT INTO announcements (label, title, detail, is_published)
       VALUES ($1, $2, $3, $4)
       RETURNING announcement_id, label, title, detail, is_published, created_at, updated_at`,
      [label, title, detail, isPublished]
    );
    res.status(201).json({ success: true, announcement: result.rows[0] });
  })
);

router.put(
  '/content/announcements/:id',
  requireAuth,
  requireRole('Admin'),
  [
    body('label').optional().trim().notEmpty(),
    body('title').optional().trim().notEmpty(),
    body('detail').optional().trim().notEmpty(),
    body('isPublished').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0].msg);

    const { label, title, detail, isPublished } = req.body;
    const updates = [];
    const values = [];
    let index = 1;

    for (const [field, value] of [['label', label], ['title', title], ['detail', detail]]) {
      if (value !== undefined) {
        updates.push(`${field} = $${index}`);
        values.push(value);
        index++;
      }
    }
    if (isPublished !== undefined) {
      updates.push(`is_published = $${index}`);
      values.push(isPublished);
      index++;
    }
    if (updates.length === 0) throw new HttpError(400, 'At least one field is required');

    updates.push('updated_at = NOW()');
    values.push(req.params.id);
    const result = await query(
      `UPDATE announcements SET ${updates.join(', ')}
       WHERE announcement_id = $${index}
       RETURNING announcement_id, label, title, detail, is_published, created_at, updated_at`,
      values
    );
    if (result.rows.length === 0) throw new HttpError(404, 'Announcement not found');
    res.status(200).json({ success: true, announcement: result.rows[0] });
  })
);

router.delete(
  '/content/announcements/:id',
  requireAuth,
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const result = await query(
      'DELETE FROM announcements WHERE announcement_id = $1 RETURNING announcement_id',
      [req.params.id]
    );
    if (result.rows.length === 0) throw new HttpError(404, 'Announcement not found');
    res.status(200).json({ success: true, message: 'Announcement deleted' });
  })
);

/**
 * =======================
 * APPOINTMENTS MANAGEMENT (Admin can CRUD any appointment)
 * =======================
 */

/**
 * GET /admin/appointments
 * List all appointments (with filters)
 */
router.get(
  '/appointments',
  requireAuth,
  requireRole('Admin'),
  [
    queryValidator('userId').optional(),
    queryValidator('facilityId').optional(),
    queryValidator('status').optional(),
    queryValidator('startDate').optional().isISO8601(),
    queryValidator('endDate').optional().isISO8601(),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('offset').optional().isInt({ min: 0 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { userId, facilityId, status, startDate, endDate, limit = 50, offset = 0 } = req.query;
    const result = await appointmentsService.listAppointments({
      userId,
      facilityId,
      status,
      startDate,
      endDate,
      orderByCreatedAt: true,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    res.status(200).json({ success: true, ...result });
  })
);

/**
 * POST /admin/appointments
 * Admin creates an appointment on behalf of a visitor
 */
router.post(
  '/appointments',
  requireAuth,
  requireRole('Admin'),
  [
    body('userId').notEmpty().withMessage('userId required'),
    body('facilityId').notEmpty().withMessage('facilityId required'),
    body('startTime').isISO8601().withMessage('startTime must be ISO8601 format'),
    body('endTime').isISO8601().withMessage('endTime must be ISO8601 format'),
    body('topic').optional().trim(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { userId, facilityId, startTime, endTime, topic } = req.body;
    const appointment = await appointmentsService.createAppointment({
      userId,
      facilityId,
      topic,
      startTime,
      endTime,
    });

    res.status(201).json({ success: true, appointment });
  })
);

/**
 * PUT /admin/appointments/:id
 * Admin updates an appointment
 */
router.put(
  '/appointments/:id',
  requireAuth,
  requireRole('Admin'),
  [
    body('startTime').optional().isISO8601(),
    body('endTime').optional().isISO8601(),
    body('topic').optional().trim(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { startTime, endTime, topic } = req.body;

    if (startTime && endTime) {
      const updated = await appointmentsService.rescheduleAppointment(
        req.params.id,
        startTime,
        endTime
      );
      res.status(200).json({ success: true, appointment: updated });
    } else {
      throw new HttpError(400, 'startTime and endTime are required for rescheduling');
    }
  })
);

/**
 * DELETE /admin/appointments/:id/cancel
 * Admin cancels an appointment
 */
router.delete(
  '/appointments/:id/cancel',
  requireAuth,
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const cancelled = await appointmentsService.cancelAppointment(req.params.id);
    res.status(200).json({ success: true, appointment: cancelled });
  })
);

/**
 * POST /admin/appointments/:id/confirm
 * Admin confirms an appointment
 */
router.post(
  '/appointments/:id/confirm',
  requireAuth,
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const confirmed = await appointmentsService.confirmAppointment(req.params.id);
    res.status(200).json({ success: true, appointment: confirmed });
  })
);

/**
 * =======================
 * ANALYTICS & REPORTING
 * =======================
 */

/**
 * GET /admin/analytics/visitor-stats
 */
router.get(
  '/analytics/visitor-stats',
  requireAuth,
  requireRole('Admin'),
  [
    queryValidator('startDate').optional().isISO8601(),
    queryValidator('endDate').optional().isISO8601(),
    queryValidator('facilityId').optional(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { startDate, endDate, facilityId } = req.query;
    const stats = await analyticsService.getVisitorStats({ startDate, endDate, facilityId });

    res.status(200).json({ success: true, stats });
  })
);

/**
 * GET /admin/analytics/capacity-utilization
 */
router.get(
  '/analytics/capacity-utilization',
  requireAuth,
  requireRole('Admin'),
  [
    queryValidator('startDate').optional().isISO8601(),
    queryValidator('endDate').optional().isISO8601(),
    queryValidator('facilityId').optional(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { startDate, endDate, facilityId } = req.query;
    const utilization = await analyticsService.getCapacityUtilization({
      startDate,
      endDate,
      facilityId,
    });

    res.status(200).json({ success: true, utilization });
  })
);

/**
 * GET /admin/analytics/attendance
 */
router.get(
  '/analytics/attendance',
  requireAuth,
  requireRole('Admin'),
  [
    queryValidator('startDate').optional().isISO8601(),
    queryValidator('endDate').optional().isISO8601(),
    queryValidator('facilityId').optional(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { startDate, endDate, facilityId } = req.query;
    const attendance = await analyticsService.getAttendanceReport({
      startDate,
      endDate,
      facilityId,
    });

    res.status(200).json({ success: true, attendance });
  })
);

/**
 * GET /admin/analytics/demographics
 */
router.get(
  '/analytics/demographics',
  requireAuth,
  requireRole('Admin'),
  [
    queryValidator('startDate').optional().isISO8601(),
    queryValidator('endDate').optional().isISO8601(),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('offset').optional().isInt({ min: 0 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { startDate, endDate, limit = 20, offset = 0 } = req.query;
    const result = await analyticsService.getVisitorDemographics({
      startDate,
      endDate,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    res.status(200).json({ success: true, ...result });
  })
);

/**
 * GET /admin/analytics/daily-traffic
 */
router.get(
  '/analytics/daily-traffic',
  requireAuth,
  requireRole('Admin'),
  [
    queryValidator('date').optional().isISO8601(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { date } = req.query;
    const traffic = await analyticsService.getDailyTrafficSummary({ date });

    res.status(200).json({ success: true, traffic });
  })
);

/**
 * =======================
 * SENTIMENT & FEEDBACK
 * =======================
 */

/**
 * GET /admin/sentiment/summary
 */
router.get(
  '/sentiment/summary',
  requireAuth,
  requireRole('Admin'),
  [
    queryValidator('startDate').optional().isISO8601(),
    queryValidator('endDate').optional().isISO8601(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { startDate, endDate } = req.query;
    const summary = await feedbackService.getSentimentSummary({ startDate, endDate });

    res.status(200).json({ success: true, summary });
  })
);

/**
 * GET /admin/sentiment/trend
 */
router.get(
  '/sentiment/trend',
  requireAuth,
  requireRole('Admin'),
  [
    queryValidator('period').optional().isIn(['day', 'week', 'month']),
    queryValidator('startDate').optional().isISO8601(),
    queryValidator('endDate').optional().isISO8601(),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { period = 'day', startDate, endDate, limit = 30 } = req.query;
    const trend = await feedbackService.getSentimentTrend({
      period,
      startDate,
      endDate,
      limit: parseInt(limit, 10),
    });

    res.status(200).json({ success: true, trend });
  })
);

/**
 * GET /admin/feedback
 */
router.get(
  '/feedback',
  requireAuth,
  requireRole('Admin'),
  [
    queryValidator('sentimentLabel').optional().isIn(['Positive', 'Neutral', 'Negative']),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('offset').optional().isInt({ min: 0 }),
    queryValidator('startDate').optional().isISO8601(),
    queryValidator('endDate').optional().isISO8601(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { sentimentLabel, limit = 20, offset = 0, startDate, endDate } = req.query;
    const result = await feedbackService.listRecentFeedback({
      sentimentLabel,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      startDate,
      endDate,
    });

    res.status(200).json({ success: true, ...result });
  })
);

/**
 * =======================
 * USER & ROLE MANAGEMENT
 * =======================
 */

/**
 * GET /admin/roles
 */
router.get(
  '/roles',
  requireAuth,
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const roles = await userRoleService.getAllRoles();
    res.status(200).json({ success: true, roles });
  })
);

/**
 * POST /admin/roles
 */
router.post(
  '/roles',
  requireAuth,
  requireRole('Admin'),
  [
    body('roleName').trim().notEmpty().withMessage('Role name required'),
    body('description').optional().trim(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { roleName, description } = req.body;
    const role = await userRoleService.createRole({ roleName, description }, req.user.sub, getClientIp(req));

    res.status(201).json({ success: true, role });
  })
);

/**
 * GET /admin/users
 */
router.get(
  '/users',
  requireAuth,
  requireRole('Admin'),
  [
    queryValidator('roleId').optional(),
    queryValidator('isActive').optional(),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('offset').optional().isInt({ min: 0 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { roleId, isActive, limit = 50, offset = 0 } = req.query;
    const result = await userRoleService.getAllUsers({
      roleId,
      isActive: isActive ? isActive === 'true' : null,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    res.status(200).json({ success: true, ...result });
  })
);

/**
 * POST /admin/users
 * Create a new user (Admin/Researcher)
 */
router.post(
  '/users',
  requireAuth,
  requireRole('Admin'),
  [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('firstName').trim().notEmpty().withMessage('First name required'),
    body('lastName').trim().notEmpty().withMessage('Last name required'),
    body('roleId').notEmpty().withMessage('roleId required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { username, email, password, firstName, lastName, roleId } = req.body;
    const user = await userRoleService.createUser(
      { username, email, password, firstName, lastName, roleId },
      req.user.sub,
      getClientIp(req)
    );

    res.status(201).json({ success: true, user });
  })
);

/**
 * PUT /admin/users/:id
 */
router.put(
  '/users/:id',
  requireAuth,
  requireRole('Admin'),
  [
    body('email').optional().isEmail(),
    body('firstName').optional().trim(),
    body('lastName').optional().trim(),
    body('roleId').optional(),
    body('isActive').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const updateData = req.body;
    const user = await userRoleService.updateUser(
      req.params.id,
      updateData,
      req.user.sub,
      getClientIp(req)
    );

    res.status(200).json({ success: true, user });
  })
);

/**
 * DELETE /admin/users/:id/deactivate
 */
router.delete(
  '/users/:id/deactivate',
  requireAuth,
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const user = await userRoleService.deactivateUser(
      req.params.id,
      req.user.sub,
      getClientIp(req)
    );

    res.status(200).json({ success: true, user });
  })
);

/**
 * POST /admin/users/:id/reset-password
 */
router.post(
  '/users/:id/reset-password',
  requireAuth,
  requireRole('Admin'),
  [
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { newPassword } = req.body;
    const user = await userRoleService.resetUserPassword(
      req.params.id,
      newPassword,
      req.user.sub,
      getClientIp(req)
    );

    res.status(200).json({ success: true, user });
  })
);

/**
 * =======================
 * FACILITY MANAGEMENT
 * =======================
 */

/**
 * GET /admin/facilities
 */
router.get(
  '/facilities',
  requireAuth,
  requireRole('Admin'),
  [
    queryValidator('isActive').optional(),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('offset').optional().isInt({ min: 0 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { isActive, limit = 50, offset = 0 } = req.query;
    const result = await facilityService.getAllFacilities({
      isActive: isActive ? isActive === 'true' : null,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    res.status(200).json({ success: true, ...result });
  })
);

/**
 * POST /admin/facilities
 */
router.post(
  '/facilities',
  requireAuth,
  requireRole('Admin'),
  [
    body('facilityName').trim().notEmpty().withMessage('Facility name required'),
    body('location').trim().notEmpty().withMessage('Location required'),
    body('maxCapacity').isInt({ min: 1 }).withMessage('Max capacity must be > 0'),
    body('description').optional().trim(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { facilityName, location, maxCapacity, description } = req.body;
    const facility = await facilityService.createFacility(
      { facilityName, location, maxCapacity, description },
      req.user.sub,
      getClientIp(req)
    );

    res.status(201).json({ success: true, facility });
  })
);

/**
 * PUT /admin/facilities/:id
 */
router.put(
  '/facilities/:id',
  requireAuth,
  requireRole('Admin'),
  [
    body('facilityName').optional().trim(),
    body('location').optional().trim(),
    body('maxCapacity').optional().isInt({ min: 1 }),
    body('description').optional().trim(),
    body('isActive').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const updateData = req.body;
    const facility = await facilityService.updateFacility(
      req.params.id,
      updateData,
      req.user.sub,
      getClientIp(req)
    );

    res.status(200).json({ success: true, facility });
  })
);

/**
 * GET /admin/facilities/:id/capacity-status
 */
router.get(
  '/facilities/:id/capacity-status',
  requireAuth,
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const status = await facilityService.getFacilityCapacityStatus(req.params.id);
    res.status(200).json({ success: true, status });
  })
);

/**
 * =======================
 * AUDIT LOG
 * =======================
 */

/**
 * GET /admin/audit-log
 */
router.get(
  '/audit-log',
  requireAuth,
  requireRole('Admin'),
  [
    queryValidator('userId').optional(),
    queryValidator('actionPerformed').optional(),
    queryValidator('startDate').optional().isISO8601(),
    queryValidator('endDate').optional().isISO8601(),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('offset').optional().isInt({ min: 0 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { userId, actionPerformed, startDate, endDate, limit = 50, offset = 0 } = req.query;
    const result = await auditService.getAuditLog({
      userId,
      actionPerformed,
      startDate,
      endDate,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    res.status(200).json({ success: true, ...result });
  })
);

/**
 * GET /admin/audit-log/actions
 */
router.get(
  '/audit-log/actions',
  requireAuth,
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const actions = await auditService.getAvailableActions();
    res.status(200).json({ success: true, actions });
  })
);

/**
 * GET /admin/audit-log/summary
 */
router.get(
  '/audit-log/summary',
  requireAuth,
  requireRole('Admin'),
  [
    queryValidator('startDate').optional().isISO8601(),
    queryValidator('endDate').optional().isISO8601(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { startDate, endDate } = req.query;
    const summary = await auditService.getAuditSummary({ startDate, endDate });

    res.status(200).json({ success: true, summary });
  })
);

/**
 * =======================
 * CHATBOT FAQ MANAGEMENT
 * =======================
 */

router.get(
  '/chatbot/faq',
  requireAuth,
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT faq_id, question, answer, keywords, training_phrases, category, is_active, created_at, updated_at
       FROM chatbot_faq
       ORDER BY created_at DESC`
    );

    res.status(200).json({ success: true, faqs: result.rows });
  })
);

router.post(
  '/chatbot/faq',
  requireAuth,
  requireRole('Admin'),
  [
    body('question').trim().notEmpty().withMessage('Question required'),
    body('answer').trim().notEmpty().withMessage('Answer required'),
    body('keywords').optional().isArray(),
    body('trainingPhrases').optional().isArray(),
    body('category').optional().trim(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { question, answer, keywords = [], trainingPhrases = [], category = 'general' } = req.body;
    const result = await query(
      `INSERT INTO chatbot_faq (question, answer, keywords, training_phrases, category, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (question) DO UPDATE SET answer = EXCLUDED.answer, keywords = EXCLUDED.keywords,
         training_phrases = EXCLUDED.training_phrases, category = EXCLUDED.category, updated_at = NOW()
       RETURNING faq_id, question, answer, keywords, training_phrases, category, is_active, created_at, updated_at`,
      [question, answer, keywords, trainingPhrases, category]
    );

    res.status(201).json({ success: true, faq: result.rows[0] });
  })
);

router.put(
  '/chatbot/faq/:id',
  requireAuth,
  requireRole('Admin'),
  [
    body('question').optional().trim(),
    body('answer').optional().trim(),
    body('keywords').optional().isArray(),
    body('trainingPhrases').optional().isArray(),
    body('category').optional().trim(),
    body('isActive').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { question, answer, keywords, trainingPhrases, category, isActive } = req.body;
    const updates = [];
    const values = [];
    let index = 1;

    if (question !== undefined) {
      updates.push(`question = $${index}`); values.push(question); index++;
    }
    if (answer !== undefined) {
      updates.push(`answer = $${index}`); values.push(answer); index++;
    }
    if (keywords !== undefined) {
      updates.push(`keywords = $${index}`); values.push(keywords); index++;
    }
    if (trainingPhrases !== undefined) {
      updates.push(`training_phrases = $${index}`); values.push(trainingPhrases); index++;
    }
    if (category !== undefined) {
      updates.push(`category = $${index}`); values.push(category); index++;
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${index}`); values.push(isActive); index++;
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await query(
      `UPDATE chatbot_faq
       SET ${updates.join(', ')}
       WHERE faq_id = $${index}
       RETURNING faq_id, question, answer, keywords, training_phrases, category, is_active, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'FAQ not found');
    }

    res.status(200).json({ success: true, faq: result.rows[0] });
  })
);

router.delete(
  '/chatbot/faq/:id',
  requireAuth,
  requireRole('Admin'),
  asyncHandler(async (req, res) => {
    const result = await query(
      `DELETE FROM chatbot_faq WHERE faq_id = $1 RETURNING faq_id`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'FAQ not found');
    }

    res.status(200).json({ success: true, message: 'FAQ deleted' });
  })
);

module.exports = router;
