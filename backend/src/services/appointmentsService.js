const { withTransaction, query } = require('../config/db');
const { HttpError } = require('../middleware/errorHandler');
const { notifyBookingConfirmation, notifyBookingCancellation, notifyNewAppointment, notifyCapacityThreshold } = require('./notificationsService');

const getPeakOccupancy = (appointments, startTime, endTime) => {
  const windowStart = new Date(startTime).getTime();
  const windowEnd = new Date(endTime).getTime();
  const events = [];

  for (const appointment of appointments) {
    const appointmentStart = Math.max(windowStart, new Date(appointment.start_time).getTime());
    const appointmentEnd = Math.min(windowEnd, new Date(appointment.end_time).getTime());
    if (appointmentStart < appointmentEnd) {
      events.push({ time: appointmentStart, change: 1 }, { time: appointmentEnd, change: -1 });
    }
  }

  events.sort((left, right) => left.time - right.time || left.change - right.change);
  let occupancy = 0;
  let peakOccupancy = 0;
  for (const event of events) {
    occupancy += event.change;
    peakOccupancy = Math.max(peakOccupancy, occupancy);
  }
  return peakOccupancy;
};

/**
 * Core logic: Assert that capacity is available for a time window
 * Must run inside a transaction with FOR UPDATE lock
 * This is the ONLY place where capacity is checked - never duplicate this logic
 */
const assertCapacityAvailable = async (client, facilityId, startTime, endTime, excludeAppointmentId = null) => {
  // Lock the facility row to serialize concurrent bookings
  const facilityLock = await client.query(
    'SELECT max_capacity FROM facilities WHERE facility_id = $1 AND is_active = true FOR UPDATE',
    [facilityId]
  );

  if (facilityLock.rows.length === 0) {
    throw new HttpError(404, 'Facility not found');
  }

  const maxCapacity = facilityLock.rows[0].max_capacity;

  // Calculate the maximum simultaneous occupancy during the requested window.
  let appointmentsQuery = `
    SELECT appointment_id, start_time, end_time FROM appointments
    WHERE facility_id = $1
      AND status IN ('Pending', 'Confirmed')
      AND start_time < $2
      AND end_time > $3
  `;

  let appointmentParams = [facilityId, endTime, startTime];

  if (excludeAppointmentId) {
    appointmentsQuery += ' AND appointment_id != $4';
    appointmentParams.push(excludeAppointmentId);
  }

  const appointmentsResult = await client.query(appointmentsQuery, appointmentParams);
  const currentCount = getPeakOccupancy(appointmentsResult.rows, startTime, endTime);

  if (currentCount >= maxCapacity) {
    throw new HttpError(409, `Facility at capacity: ${currentCount}/${maxCapacity} slots booked`);
  }

  return { currentCount, maxCapacity };
};

/**
 * Create a new appointment
 */
const createAppointment = async ({ userId, facilityId, topic, startTime, endTime }) => {
  if (!userId || !facilityId || !startTime || !endTime) {
    throw new HttpError(400, 'Missing required fields: userId, facilityId, startTime, endTime');
  }

  if (new Date(endTime) <= new Date(startTime)) {
    throw new HttpError(400, 'End time must be after start time');
  }
  if (new Date(startTime) <= new Date()) {
    throw new HttpError(400, 'Appointment must start in the future');
  }

  return withTransaction(async (client) => {
    // Assert capacity before inserting
    await assertCapacityAvailable(client, facilityId, startTime, endTime);

    // Create appointment
    const result = await client.query(
      `INSERT INTO appointments (user_id, facility_id, topic, start_time, end_time, status)
       VALUES ($1, $2, $3, $4, $5, 'Pending')
       RETURNING appointment_id, user_id, facility_id, topic, start_time, end_time, status, qr_token, created_at`,
      [userId, facilityId, topic, startTime, endTime]
    );

    const appointment = result.rows[0];

    // Get user info for notifications
    const userResult = await client.query(
      'SELECT user_id, username, email, first_name, last_name FROM users WHERE user_id = $1',
      [userId]
    );

    const user = userResult.rows[0];

    // Fetch facility info
    const facilityResult = await client.query(
      'SELECT facility_name FROM facilities WHERE facility_id = $1',
      [facilityId]
    );

    const facility = facilityResult.rows[0];
    const notificationAppointment = { ...appointment, facility_name: facility?.facility_name };

    // After transaction completes, send notifications asynchronously
    setImmediate(() => {
      notifyNewAppointment(notificationAppointment, user).catch(err =>
        console.error('Error notifying new appointment:', err)
      );
    });

    return { ...appointment, facility, user };
  });
};

/**
 * Get appointment by ID
 */
const getAppointment = async (appointmentId) => {
  try {
    const result = await query(
      `SELECT a.*, f.facility_name, u.first_name, u.last_name, u.email
       FROM appointments a
       JOIN facilities f ON a.facility_id = f.facility_id
       JOIN users u ON a.user_id = u.user_id
       WHERE a.appointment_id = $1`,
      [appointmentId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Appointment not found');
    }

    return result.rows[0];
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error fetching appointment: ' + error.message);
  }
};

/**
 * List appointments with filters
 */
const listAppointments = async ({
  userId = null,
  facilityId = null,
  status = null,
  startDate = null,
  endDate = null,
  orderByCreatedAt = false,
  limit = 50,
  offset = 0,
}) => {
  try {
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 1;

    if (userId) {
      whereClause += ` AND a.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (facilityId) {
      whereClause += ` AND a.facility_id = $${paramIndex}`;
      params.push(facilityId);
      paramIndex++;
    }

    if (status) {
      whereClause += ` AND a.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (startDate) {
      whereClause += ` AND a.start_time >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND a.end_time <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    const result = await query(
      `SELECT a.*, f.facility_name, u.first_name, u.last_name, u.email
       FROM appointments a
       JOIN facilities f ON a.facility_id = f.facility_id
       JOIN users u ON a.user_id = u.user_id
       WHERE ${whereClause}
       ORDER BY ${orderByCreatedAt ? 'a.created_at DESC' : 'a.start_time DESC'}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM appointments a WHERE ${whereClause}`,
      params
    );

    return {
      appointments: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
      limit,
      offset,
    };
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error listing appointments: ' + error.message);
  }
};

/**
 * Reschedule an appointment
 */
const rescheduleAppointment = async (appointmentId, newStartTime, newEndTime) => {
  if (!appointmentId || !newStartTime || !newEndTime) {
    throw new HttpError(400, 'Missing required fields');
  }

  if (new Date(newEndTime) <= new Date(newStartTime)) {
    throw new HttpError(400, 'End time must be after start time');
  }
  if (new Date(newStartTime) <= new Date()) {
    throw new HttpError(400, 'Rescheduled appointment must start in the future');
  }

  return withTransaction(async (client) => {
    // Get existing appointment
    const existingResult = await client.query(
      `SELECT a.appointment_id, a.user_id, a.facility_id, a.status, a.start_time,
              EXISTS (SELECT 1 FROM logs l WHERE l.appointment_id = a.appointment_id) AS has_log
       FROM appointments a WHERE a.appointment_id = $1`,
      [appointmentId]
    );

    if (existingResult.rows.length === 0) {
      throw new HttpError(404, 'Appointment not found');
    }

    const appointment = existingResult.rows[0];

    if (appointment.status === 'Cancelled') {
      throw new HttpError(400, 'Cannot reschedule a cancelled appointment');
    }

    if (appointment.status === 'Completed') {
      throw new HttpError(400, 'Cannot reschedule a completed appointment');
    }
    if (appointment.has_log || new Date(appointment.start_time) <= new Date()) {
      throw new HttpError(400, 'Cannot reschedule an appointment that has started');
    }

    // Assert capacity (excluding this appointment from its own count)
    await assertCapacityAvailable(
      client,
      appointment.facility_id,
      newStartTime,
      newEndTime,
      appointmentId
    );

    // Update appointment
    const result = await client.query(
      `UPDATE appointments
         SET start_time = $1, end_time = $2,
           qr_token = CASE WHEN status = 'Confirmed' THEN gen_random_uuid() ELSE NULL END,
           qr_expires_at = CASE WHEN status = 'Confirmed' THEN $2 ELSE NULL END,
           updated_at = NOW()
       WHERE appointment_id = $3
       RETURNING appointment_id, user_id, facility_id, status, start_time, end_time`,
      [newStartTime, newEndTime, appointmentId]
    );

    return result.rows[0];
  });
};

/**
 * Cancel an appointment
 */
const cancelAppointment = async (appointmentId, reason = null) => {
  try {
    const result = await query(
      `UPDATE appointments
      SET status = 'Cancelled', qr_token = NULL, qr_expires_at = NULL, updated_at = NOW()
       WHERE appointment_id = $1
         AND status IN ('Pending', 'Confirmed')
         AND start_time > NOW()
         AND NOT EXISTS (SELECT 1 FROM logs WHERE logs.appointment_id = appointments.appointment_id)
       RETURNING appointment_id, user_id, facility_id, status`,
      [appointmentId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(400, 'Appointment not found or cannot be cancelled in its current state');
    }

    const appointment = result.rows[0];

    // Get user for notification
    const userResult = await query(
      'SELECT first_name, last_name, email FROM users WHERE user_id = $1',
      [appointment.user_id]
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      setImmediate(() => {
        notifyBookingCancellation(appointment, user).catch(err =>
          console.error('Error notifying cancellation:', err)
        );
      });
    }

    return appointment;
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error cancelling appointment: ' + error.message);
  }
};

/**
 * Confirm an appointment (set status to Confirmed)
 */
const confirmAppointment = async (appointmentId) => {
  try {
    const result = await query(
      `UPDATE appointments
      SET status = 'Confirmed', qr_token = gen_random_uuid(), qr_expires_at = end_time, updated_at = NOW()
      WHERE appointment_id = $1 AND status = 'Pending'
      RETURNING appointment_id, user_id, facility_id, status, start_time, end_time, qr_token, qr_expires_at`,
      [appointmentId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(409, 'Appointment not found or is no longer pending');
    }

    const appointment = result.rows[0];

    // Get user for notification
    const userResult = await query(
      'SELECT first_name, last_name, email FROM users WHERE user_id = $1',
      [appointment.user_id]
    );
    const facilityResult = await query(
      'SELECT facility_name FROM facilities WHERE facility_id = $1',
      [appointment.facility_id]
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      const confirmedAppointment = {
        ...appointment,
        facility_name: facilityResult.rows[0]?.facility_name,
      };
      setImmediate(() => {
        notifyBookingConfirmation(confirmedAppointment, user).catch(err =>
          console.error('Error notifying confirmation:', err)
        );
      });
    }

    return appointment;
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error confirming appointment: ' + error.message);
  }
};

/**
 * Get available slots for a facility on a given date
 */
const getAvailableSlots = async (facilityId, date, slotDurationMinutes = 60) => {
  try {
    const [year, month, day] = String(date).split('-').map(Number);
    const requestedDate = new Date(Date.UTC(year, month - 1, day));
    if (!year || !month || !day || requestedDate.toISOString().slice(0, 10) !== date) {
      throw new HttpError(400, 'date must be a valid YYYY-MM-DD date');
    }

    const facility = await query(
      'SELECT max_capacity FROM facilities WHERE facility_id = $1',
      [facilityId]
    );

    if (facility.rows.length === 0) {
      throw new HttpError(404, 'Facility not found');
    }

    const maxCapacity = facility.rows[0].max_capacity;

    // Get booked appointments for this day
    const startOfDay = new Date(Date.UTC(year, month - 1, day, -8));
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const booked = await query(
      `SELECT start_time, end_time FROM appointments
       WHERE facility_id = $1
         AND status IN ('Pending', 'Confirmed')
         AND start_time < $2
         AND end_time > $3`,
      [facilityId, endOfDay.toISOString(), startOfDay.toISOString()]
    );

    // Simple availability: generate hourly slots and check capacity
    // TODO: Enhance with custom business hours, break times, etc.
    const slots = [];
    const slotMs = slotDurationMinutes * 60 * 1000;

    for (let hour = 8; hour < 17; hour++) {
      const slotStart = new Date(Date.UTC(year, month - 1, day, hour - 8));
      const slotEnd = new Date(slotStart.getTime() + slotMs);

      const peakOccupancy = getPeakOccupancy(booked.rows, slotStart, slotEnd);
      const availableSpots = maxCapacity - peakOccupancy;
      const available = availableSpots > 0 && slotStart.getTime() > Date.now();

      slots.push({
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        available,
        spotsRemaining: available ? availableSpots : 0,
      });
    }

    return slots;
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error getting available slots: ' + error.message);
  }
};

module.exports = {
  createAppointment,
  getAppointment,
  listAppointments,
  rescheduleAppointment,
  cancelAppointment,
  confirmAppointment,
  getAvailableSlots,
  getPeakOccupancy,
};
