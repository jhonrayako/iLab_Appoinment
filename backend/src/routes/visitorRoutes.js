const express = require('express');
const { body, query: queryValidator, validationResult } = require('express-validator');
const router = express.Router();
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const appointmentsService = require('../services/appointmentsService');
const feedbackService = require('../services/feedbackService');
const QRCode = require('qrcode');
const { sendEmail } = require('../services/notificationsService');

router.post(
  '/contact',
  [
    body('name').trim().isLength({ min: 2, max: 120 }),
    body('email').isEmail().normalizeEmail(),
    body('message').trim().isLength({ min: 5, max: 3000 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new HttpError(400, errors.array()[0].msg);
    const { name, email, message } = req.body;
    await sendEmail({
      to: process.env.PUBLIC_CONTACT_EMAIL || 'ilabguiguinto@gmail.com',
      subject: `Public inquiry from ${name}`,
      body: `From: ${name}\nReply to: ${email}\n\n${message}`,
    });
    res.status(202).json({ success: true, message: 'Your message has been sent to the iLAB support team.' });
  })
);

/**
 * GET /visitor/availability
 * Get available time slots for a facility on a given date (public)
 */
router.get(
  '/availability',
  [
    queryValidator('facilityId').notEmpty().withMessage('facilityId required'),
    queryValidator('date').isDate().withMessage('date must be YYYY-MM-DD format'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { facilityId, date } = req.query;
    const slots = await appointmentsService.getAvailableSlots(facilityId, date);

    res.status(200).json({ success: true, slots });
  })
);

/**
 * POST /visitor/appointments
 * Create a new appointment (Visitor only)
 */
router.post(
  '/appointments',
  requireAuth,
  requireRole('Visitor'),
  [
    body('facilityId').notEmpty().withMessage('facilityId required'),
    body('startTime').isISO8601().withMessage('startTime must be ISO8601 format'),
    body('endTime').isISO8601().withMessage('endTime must be ISO8601 format'),
    body('topic').optional().trim().isLength({ max: 255 }).withMessage('topic cannot exceed 255 characters'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { facilityId, startTime, endTime, topic } = req.body;
    const appointment = await appointmentsService.createAppointment({
      userId: req.user.sub,
      facilityId,
      topic,
      startTime,
      endTime,
    });

    res.status(201).json({ success: true, appointment });
  })
);

/**
 * GET /visitor/appointments
 * List visitor's own appointments
 */
router.get(
  '/appointments',
  requireAuth,
  requireRole('Visitor'),
  [
    queryValidator('status').optional(),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('offset').optional().isInt({ min: 0 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { status, limit = 20, offset = 0 } = req.query;
    const result = await appointmentsService.listAppointments({
      userId: req.user.sub,
      status,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    res.status(200).json({ success: true, ...result });
  })
);

/**
 * GET /visitor/appointments/:id
 * Get a specific appointment
 */
router.get(
  '/appointments/:id',
  requireAuth,
  requireRole('Visitor'),
  asyncHandler(async (req, res) => {
    const appointment = await appointmentsService.getAppointment(req.params.id);

    // Verify ownership
    if (appointment.user_id !== req.user.sub) {
      throw new HttpError(403, 'Cannot access other users\' appointments');
    }

    res.status(200).json({ success: true, appointment });
  })
);

router.get(
  '/appointments/:id/pass',
  requireAuth,
  requireRole('Visitor'),
  asyncHandler(async (req, res) => {
    const appointment = await appointmentsService.getAppointment(req.params.id);
    if (appointment.user_id !== req.user.sub) {
      throw new HttpError(403, 'Cannot access another visitor\'s appointment pass');
    }
    if (appointment.status !== 'Confirmed') {
      throw new HttpError(400, 'A visit pass is available after your appointment is confirmed');
    }
    if (!appointment.qr_token || !appointment.qr_expires_at || new Date(appointment.qr_expires_at) <= new Date()) {
      throw new HttpError(400, 'This appointment QR code has expired');
    }
    const qrCode = await QRCode.toDataURL(appointment.qr_token, { margin: 1, width: 240 });
    res.status(200).json({ success: true, qr_code: qrCode, expires_at: appointment.qr_expires_at });
  })
);

/**
 * PUT /visitor/appointments/:id/reschedule
 * Reschedule an appointment
 */
router.put(
  '/appointments/:id/reschedule',
  requireAuth,
  requireRole('Visitor'),
  [
    body('newStartTime').isISO8601().withMessage('newStartTime must be ISO8601 format'),
    body('newEndTime').isISO8601().withMessage('newEndTime must be ISO8601 format'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const appointment = await appointmentsService.getAppointment(req.params.id);

    // Verify ownership
    if (appointment.user_id !== req.user.sub) {
      throw new HttpError(403, 'Cannot modify other users\' appointments');
    }

    const { newStartTime, newEndTime } = req.body;
    const updated = await appointmentsService.rescheduleAppointment(
      req.params.id,
      newStartTime,
      newEndTime
    );

    res.status(200).json({ success: true, appointment: updated });
  })
);

/**
 * DELETE /visitor/appointments/:id/cancel
 * Cancel an appointment
 */
router.delete(
  '/appointments/:id/cancel',
  requireAuth,
  requireRole('Visitor'),
  asyncHandler(async (req, res) => {
    const appointment = await appointmentsService.getAppointment(req.params.id);

    // Verify ownership
    if (appointment.user_id !== req.user.sub) {
      throw new HttpError(403, 'Cannot cancel other users\' appointments');
    }

    const cancelled = await appointmentsService.cancelAppointment(req.params.id);

    res.status(200).json({ success: true, appointment: cancelled });
  })
);

/**
 * POST /visitor/feedback
 * Submit feedback (Visitor only)
 */
router.post(
  '/feedback',
  requireAuth,
  requireRole('Visitor'),
  [
    body('message').trim().isLength({ min: 1, max: 2000 }).withMessage('Feedback must be 1 to 2000 characters'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new HttpError(400, errors.array()[0].msg);
    }

    const { message } = req.body;
    const feedback = await feedbackService.submitFeedback({
      userId: req.user.sub,
      rawMessage: message,
    });

    res.status(201).json({ success: true, feedback });
  })
);

module.exports = router;
