const express = require('express');
const { body, query: queryValidator, validationResult } = require('express-validator');
const { query } = require('../config/db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const appointmentsService = require('../services/appointmentsService');
const authService = require('../services/authService');
const eloggingService = require('../services/eloggingService');
const { getRecentAppointmentNotifications } = require('../services/notificationsService');
const QRCode = require('qrcode');

const router = express.Router();
router.use(requireAuth, requireRole('Staff'));

router.get('/dashboard', asyncHandler(async (req, res) => {
  const [summaryResult, notifications] = await Promise.all([
    query(
      `SELECT
         COUNT(*) FILTER (WHERE a.status IN ('Pending', 'Confirmed')) AS scheduled,
         COUNT(*) FILTER (
           WHERE a.status = 'Confirmed' AND l.appointment_id IS NULL
         ) AS pending_check_ins
       FROM appointments a
       LEFT JOIN logs l ON l.appointment_id = a.appointment_id
       WHERE a.start_time::date = CURRENT_DATE`
    ),
    getRecentAppointmentNotifications(),
  ]);

  res.json({
    success: true,
    summary: {
      todays_appointments: Number(summaryResult.rows[0].scheduled),
      pending_check_ins: Number(summaryResult.rows[0].pending_check_ins),
    },
    notifications,
  });
}));

router.get('/notifications', asyncHandler(async (req, res) => {
  res.json({ success: true, notifications: await getRecentAppointmentNotifications() });
}));

router.post('/appointments/:id/confirm', asyncHandler(async (req, res) => {
  const appointment = await appointmentsService.confirmAppointment(req.params.id);
  res.json({ success: true, appointment });
}));

router.get('/appointments/:id/pass', asyncHandler(async (req, res) => {
  const appointment = await appointmentsService.getAppointment(req.params.id);
  if (appointment.status !== 'Confirmed' || !appointment.qr_token) {
    throw new HttpError(400, 'Accept this appointment before generating its QR code');
  }
  if (!appointment.qr_expires_at || new Date(appointment.qr_expires_at) <= new Date()) {
    throw new HttpError(400, 'This appointment QR code has expired');
  }
  const qrCode = await QRCode.toDataURL(appointment.qr_token, { margin: 1, width: 240 });
  res.json({ success: true, qr_code: qrCode, expires_at: appointment.qr_expires_at });
}));

router.get(
  '/appointments',
  [
    queryValidator('date').optional().isISO8601(),
    queryValidator('status').optional().isIn(['Pending', 'Confirmed', 'Cancelled', 'Completed']),
    queryValidator('search').optional().trim().isLength({ max: 100 }),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('offset').optional().isInt({ min: 0 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0].msg);

    const { date, status, search, limit = 50, offset = 0 } = req.query;
    const filters = [];
    const params = [];
    if (date) {
      params.push(date);
      filters.push(`a.start_time::date = $${params.length}::date`);
    }
    if (status) {
      params.push(status);
      filters.push(`a.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      filters.push(`(
        u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length}
        OR u.username ILIKE $${params.length} OR u.email ILIKE $${params.length}
        OR COALESCE(a.topic, '') ILIKE $${params.length}
      )`);
    }

    const result = await query(
      `SELECT a.appointment_id, a.topic, a.start_time, a.end_time, a.status,
              a.qr_token, a.created_at, a.updated_at,
              u.username, u.first_name, u.last_name, u.email,
              f.facility_name, l.check_in_time, l.check_out_time
       FROM appointments a
       JOIN users u ON u.user_id = a.user_id
       JOIN facilities f ON f.facility_id = a.facility_id
       LEFT JOIN logs l ON l.appointment_id = a.appointment_id
       ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
       ORDER BY a.start_time ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit, 10), parseInt(offset, 10)]
    );
    const countResult = await query(
      `SELECT COUNT(*) AS total
       FROM appointments a
       JOIN users u ON u.user_id = a.user_id
       ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}`,
      params
    );

    res.json({
      success: true,
      appointments: result.rows,
      total: Number(countResult.rows[0].total),
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
  })
);

router.get('/appointments/:id', asyncHandler(async (req, res) => {
  const appointment = await appointmentsService.getAppointment(req.params.id);
  const logResult = await query(
    'SELECT check_in_time, check_out_time FROM logs WHERE appointment_id = $1',
    [req.params.id]
  );
  res.json({ success: true, appointment: { ...appointment, log: logResult.rows[0] || null } });
}));

router.post(
  '/resolve-pass',
  [body('qrToken').isUUID()],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0].msg);
    const result = await query(
      `SELECT a.appointment_id, a.qr_token, a.qr_expires_at, a.status, a.topic, a.start_time,
              u.first_name, u.last_name, f.facility_name,
              l.check_in_time, l.check_out_time
       FROM appointments a
       JOIN users u ON u.user_id = a.user_id
       JOIN facilities f ON f.facility_id = a.facility_id
       LEFT JOIN logs l ON l.appointment_id = a.appointment_id
       WHERE a.qr_token = $1`,
      [req.body.qrToken]
    );
    if (result.rows.length === 0) throw new HttpError(404, 'No appointment matches this pass');
    const appointment = result.rows[0];
    if (appointment.status !== 'Confirmed') {
      throw new HttpError(400, 'This appointment pass is no longer valid');
    }
    if (!appointment.qr_expires_at || new Date(appointment.qr_expires_at) <= new Date()) {
      throw new HttpError(400, 'This appointment QR code has expired');
    }
    const action = appointment.check_in_time && !appointment.check_out_time ? 'check-out' : 'check-in';
    res.json({ success: true, appointment, action });
  })
);

router.get('/flow', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT f.facility_id, f.facility_name, f.location, f.max_capacity,
            COUNT(l.log_id) FILTER (WHERE l.check_out_time IS NULL) AS current_visitors
     FROM facilities f
     LEFT JOIN appointments a ON a.facility_id = f.facility_id
     LEFT JOIN logs l ON l.appointment_id = a.appointment_id
     WHERE f.is_active = true
     GROUP BY f.facility_id
     ORDER BY f.facility_name`
  );
  res.json({
    success: true,
    facilities: result.rows.map((facility) => ({
      ...facility,
      current_visitors: Number(facility.current_visitors),
      capacity_percentage: Math.round((Number(facility.current_visitors) / facility.max_capacity) * 100),
    })),
  });
}));

router.post(
  '/check-in',
  [body('appointmentId').optional().isUUID(), body('qrToken').optional().isUUID()],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0].msg);
    const log = await eloggingService.checkIn(req.body);
    res.status(201).json({ success: true, log });
  })
);

router.post(
  '/check-out',
  [body('appointmentId').optional().isUUID(), body('qrToken').optional().isUUID()],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0].msg);
    const result = await eloggingService.checkOut(req.body);
    res.json({ success: true, ...result });
  })
);

router.get('/account', asyncHandler(async (req, res) => {
  const user = await authService.getCurrentUser(req.user.sub);
  res.json({ success: true, user });
}));

router.post(
  '/account/password',
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0].msg);
    const result = await authService.changePassword({
      userId: req.user.sub,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
    });
    res.json({ success: true, ...result });
  })
);

module.exports = router;