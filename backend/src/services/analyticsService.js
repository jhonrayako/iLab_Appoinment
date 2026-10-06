const { query } = require('../config/db');
const { HttpError } = require('../middleware/errorHandler');

/**
 * Get visitor statistics (appointments over time)
 */
const getVisitorStats = async ({
  startDate = null,
  endDate = null,
  facilityId = null,
} = {}) => {
  try {
    let query_text = `
      SELECT 
        DATE(a.start_time) as date,
        COUNT(*) as total_appointments,
        SUM(CASE WHEN a.status = 'Confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN a.status = 'Pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN a.status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN a.status = 'Completed' THEN 1 ELSE 0 END) as completed
      FROM appointments a
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query_text += ` AND a.start_time >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query_text += ` AND a.end_time <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (facilityId) {
      query_text += ` AND a.facility_id = $${paramIndex}`;
      params.push(facilityId);
      paramIndex++;
    }

    query_text += ` GROUP BY DATE(a.start_time) ORDER BY date DESC`;

    const result = await query(query_text, params);
    return result.rows;
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error getting visitor stats: ' + error.message);
  }
};

/**
 * Get capacity utilization report
 */
const getCapacityUtilization = async ({
  startDate = null,
  endDate = null,
  facilityId = null,
} = {}) => {
  try {
    let query_text = `
      SELECT 
        DATE(a.start_time) as date,
        f.facility_id,
        f.facility_name,
        f.max_capacity,
        COUNT(DISTINCT a.appointment_id) as booked_slots,
        ROUND(100.0 * COUNT(DISTINCT a.appointment_id) / f.max_capacity, 2) as utilization_percent
      FROM appointments a
      JOIN facilities f ON a.facility_id = f.facility_id
      WHERE a.status IN ('Pending', 'Confirmed')
    `;

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query_text += ` AND a.start_time >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query_text += ` AND a.end_time <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (facilityId) {
      query_text += ` AND a.facility_id = $${paramIndex}`;
      params.push(facilityId);
      paramIndex++;
    }

    query_text += ` GROUP BY DATE(a.start_time), f.facility_id, f.facility_name, f.max_capacity
                    ORDER BY date DESC, facility_name`;

    const result = await query(query_text, params);
    return result.rows;
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error getting capacity utilization: ' + error.message);
  }
};

/**
 * Get attendance report (check-ins vs no-shows)
 */
const getAttendanceReport = async ({
  startDate = null,
  endDate = null,
  facilityId = null,
} = {}) => {
  try {
    let query_text = `
      SELECT 
        DATE(a.start_time) as date,
        f.facility_id,
        f.facility_name,
        COUNT(DISTINCT a.appointment_id) as scheduled,
        COUNT(DISTINCT CASE WHEN l.check_in_time IS NOT NULL THEN a.appointment_id END) as checked_in,
        COUNT(DISTINCT CASE WHEN l.log_id IS NULL THEN a.appointment_id END) as no_show,
        COUNT(DISTINCT CASE WHEN l.check_out_time IS NOT NULL THEN a.appointment_id END) as completed
      FROM appointments a
      LEFT JOIN facilities f ON a.facility_id = f.facility_id
      LEFT JOIN logs l ON a.appointment_id = l.appointment_id
      WHERE a.status IN ('Confirmed', 'Completed')
    `;

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query_text += ` AND a.start_time >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query_text += ` AND a.end_time <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (facilityId) {
      query_text += ` AND a.facility_id = $${paramIndex}`;
      params.push(facilityId);
      paramIndex++;
    }

    query_text += ` GROUP BY DATE(a.start_time), f.facility_id, f.facility_name
                    ORDER BY date DESC, facility_name`;

    const result = await query(query_text, params);
    return result.rows;
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error getting attendance report: ' + error.message);
  }
};

/**
 * Get visitor demographics (booking frequency by visitor)
 */
const getVisitorDemographics = async ({
  startDate = null,
  endDate = null,
  limit = 20,
  offset = 0,
} = {}) => {
  try {
    let query_text = `
      SELECT 
        u.user_id,
        u.username,
        u.email,
        u.first_name,
        u.last_name,
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN a.status = 'Completed' THEN 1 END) as completed_visits,
        COUNT(CASE WHEN a.status = 'Cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN l.log_id IS NOT NULL THEN 1 END) as actual_visits,
        MIN(a.created_at) as first_booking,
        MAX(a.created_at) as last_booking
      FROM users u
      LEFT JOIN appointments a ON u.user_id = a.user_id
      LEFT JOIN logs l ON a.appointment_id = l.appointment_id
      WHERE u.role_id = (SELECT role_id FROM roles WHERE role_name = 'Visitor')
    `;

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query_text += ` AND a.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query_text += ` AND a.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query_text += `
      GROUP BY u.user_id, u.username, u.email, u.first_name, u.last_name
      ORDER BY total_bookings DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await query(query_text, params);

    // Count total visitors
    const countResult = await query(
      `SELECT COUNT(DISTINCT u.user_id) as total
       FROM users u
       WHERE u.role_id = (SELECT role_id FROM roles WHERE role_name = 'Visitor')`
    );

    return {
      demographics: result.rows,
      total_visitors: parseInt(countResult.rows[0].total, 10),
      limit,
      offset,
    };
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error getting visitor demographics: ' + error.message);
  }
};

/**
 * Get daily traffic summary
 */
const getDailyTrafficSummary = async ({
  date = new Date(),
} = {}) => {
  try {
    const dateStr = new Date(date).toISOString().split('T')[0];

    const summary = {};

    // Scheduled appointments for the day
    const scheduledResult = await query(
      `SELECT COUNT(*) as count FROM appointments 
       WHERE DATE(start_time) = $1 AND status IN ('Pending', 'Confirmed')`,
      [dateStr]
    );
    summary.scheduled = parseInt(scheduledResult.rows[0].count, 10);

    // Checked in (actual visitors)
    const checkedInResult = await query(
      `SELECT COUNT(*) as count FROM logs 
       WHERE DATE(check_in_time) = $1`,
      [dateStr]
    );
    summary.checked_in = parseInt(checkedInResult.rows[0].count, 10);

    // Currently in facility (checked in but not out)
    const currentResult = await query(
      `SELECT COUNT(*) as count FROM logs 
       WHERE DATE(check_in_time) = $1 AND check_out_time IS NULL`,
      [dateStr]
    );
    summary.currently_in_facility = parseInt(currentResult.rows[0].count, 10);

    // Checked out
    const checkedOutResult = await query(
      `SELECT COUNT(*) as count FROM logs 
       WHERE DATE(check_out_time) = $1`,
      [dateStr]
    );
    summary.checked_out = parseInt(checkedOutResult.rows[0].count, 10);

    // No-shows
    summary.no_shows = summary.scheduled - summary.checked_in;

    return { date: dateStr, ...summary };
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error getting daily traffic summary: ' + error.message);
  }
};

module.exports = {
  getVisitorStats,
  getCapacityUtilization,
  getAttendanceReport,
  getVisitorDemographics,
  getDailyTrafficSummary,
};
