const { query, withTransaction } = require('../config/db');
const { HttpError } = require('../middleware/errorHandler');

/**
 * Check in: create a log entry for an appointment
 * Can use either appointmentId or qrToken
 */
const checkIn = async ({ appointmentId = null, qrToken = null }) => {
  if (!appointmentId && !qrToken) {
    throw new HttpError(400, 'Either appointmentId or qrToken must be provided');
  }

  return withTransaction(async (client) => {
    // Resolve appointment
    let appointment;

    if (appointmentId) {
      const result = await client.query(
        `SELECT appointment_id, status, user_id FROM appointments WHERE appointment_id = $1`,
        [appointmentId]
      );
      appointment = result.rows[0];
    } else {
      const result = await client.query(
        `SELECT appointment_id, status, user_id, qr_expires_at
         FROM appointments WHERE qr_token = $1`,
        [qrToken]
      );
      appointment = result.rows[0];
    }

    if (!appointment) {
      throw new HttpError(404, 'Appointment not found');
    }

    if (appointment.status !== 'Confirmed') {
      throw new HttpError(400, 'Only confirmed appointments can be checked in');
    }

    if (!appointment.qr_expires_at || new Date(appointment.qr_expires_at) <= new Date()) {
      throw new HttpError(400, 'This appointment QR code has expired');
    }

    // Check if log already exists (enforces 1:1 rule)
    const existingLog = await client.query(
      'SELECT log_id FROM logs WHERE appointment_id = $1',
      [appointment.appointment_id]
    );

    if (existingLog.rows.length > 0) {
      throw new HttpError(409, 'This appointment already has a check-in log');
    }

    // Create log entry
    const logResult = await client.query(
      `INSERT INTO logs (appointment_id, check_in_time)
       VALUES ($1, NOW())
       RETURNING log_id, appointment_id, check_in_time`,
      [appointment.appointment_id]
    );

    return logResult.rows[0];
  });
};

/**
 * Check out: close an existing log entry and mark appointment as Completed
 */
const checkOut = async ({ appointmentId = null, qrToken = null }) => {
  if (!appointmentId && !qrToken) {
    throw new HttpError(400, 'Either appointmentId or qrToken must be provided');
  }

  return withTransaction(async (client) => {
    if (!appointmentId) {
      const appointmentResult = await client.query(
        'SELECT appointment_id, status, qr_expires_at FROM appointments WHERE qr_token = $1',
        [qrToken]
      );
      const appointment = appointmentResult.rows[0];
      if (appointment && (appointment.status !== 'Confirmed' || !appointment.qr_expires_at || new Date(appointment.qr_expires_at) <= new Date())) {
        throw new HttpError(400, 'This appointment QR code has expired or is no longer valid');
      }
      appointmentId = appointment?.appointment_id;
    }

    if (!appointmentId) {
      throw new HttpError(404, 'Appointment not found');
    }

    // Get the log entry
    const logResult = await client.query(
      `SELECT log_id, appointment_id, check_in_time, check_out_time
       FROM logs
       WHERE appointment_id = $1`,
      [appointmentId]
    );

    if (logResult.rows.length === 0) {
      throw new HttpError(404, 'No check-in log found for this appointment');
    }

    const log = logResult.rows[0];

    if (log.check_out_time) {
      throw new HttpError(400, 'This appointment has already been checked out');
    }

    // Update log with check-out time
    const updatedLogResult = await client.query(
      `UPDATE logs
       SET check_out_time = NOW()
       WHERE log_id = $1
       RETURNING log_id, appointment_id, check_in_time, check_out_time`,
      [log.log_id]
    );

    // Update appointment status to Completed
    const appointmentResult = await client.query(
      `UPDATE appointments
       SET status = 'Completed', updated_at = NOW()
       WHERE appointment_id = $1
       RETURNING appointment_id, status`,
      [appointmentId]
    );

    return {
      log: updatedLogResult.rows[0],
      appointment: appointmentResult.rows[0],
    };
  });
};

/**
 * Get current visitor flow for a facility
 * Count currently checked-in visitors (check_in_time set, check_out_time null)
 */
const getCurrentFlow = async (facilityId) => {
  try {
    // Validate facility exists
    const facilityResult = await query(
      'SELECT max_capacity, facility_name FROM facilities WHERE facility_id = $1',
      [facilityId]
    );

    if (facilityResult.rows.length === 0) {
      throw new HttpError(404, 'Facility not found');
    }

    const facility = facilityResult.rows[0];

    // Count current visitors (checked in but not out)
    const countResult = await query(
      `SELECT COUNT(*) as current_count
       FROM logs
       WHERE check_in_time IS NOT NULL
         AND check_out_time IS NULL
         AND appointment_id IN (
           SELECT appointment_id FROM appointments WHERE facility_id = $1
         )`,
      [facilityId]
    );

    const currentCount = parseInt(countResult.rows[0].current_count, 10);

    return {
      facility_id: facilityId,
      facility_name: facility.facility_name,
      max_capacity: facility.max_capacity,
      current_visitors: currentCount,
      capacity_percentage: Math.round((currentCount / facility.max_capacity) * 100),
      status: currentCount >= facility.max_capacity ? 'at_capacity' : 'available',
    };
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error getting current flow: ' + error.message);
  }
};

/**
 * Get check-in/out history for a visitor
 */
const getVisitorLogs = async (userId, limit = 20, offset = 0) => {
  try {
    const result = await query(
      `SELECT l.log_id, l.appointment_id, a.topic, f.facility_name,
              l.check_in_time, l.check_out_time,
              EXTRACT(EPOCH FROM (l.check_out_time - l.check_in_time))/60 as duration_minutes
       FROM logs l
       JOIN appointments a ON l.appointment_id = a.appointment_id
       JOIN facilities f ON a.facility_id = f.facility_id
       WHERE a.user_id = $1
       ORDER BY l.check_in_time DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM logs l
       JOIN appointments a ON l.appointment_id = a.appointment_id
       WHERE a.user_id = $1`,
      [userId]
    );

    return {
      logs: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
      limit,
      offset,
    };
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error getting visitor logs: ' + error.message);
  }
};

module.exports = {
  checkIn,
  checkOut,
  getCurrentFlow,
  getVisitorLogs,
};
