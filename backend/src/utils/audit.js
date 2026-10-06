const { query } = require('../config/db');

/**
 * Record an audit log entry
 */
const recordAudit = async ({
  userId,
  actionPerformed,
  extendedDetails = null,
  ipAddress = null,
}) => {
  try {
    const result = await query(
      `INSERT INTO audit_log (user_id, action_performed, extended_details, ip_address)
       VALUES ($1, $2, $3, $4)
       RETURNING log_id, recorded_timestamp`,
      [userId, actionPerformed, extendedDetails ? JSON.stringify(extendedDetails) : null, ipAddress]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error recording audit log:', error);
    throw error;
  }
};

/**
 * Get client IP from request
 */
const getClientIp = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
};

module.exports = {
  recordAudit,
  getClientIp,
};
