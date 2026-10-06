const { query } = require('../config/db');
const { HttpError } = require('../middleware/errorHandler');

/**
 * Get audit log entries with filters
 */
const getAuditLog = async ({
  userId = null,
  actionPerformed = null,
  startDate = null,
  endDate = null,
  limit = 50,
  offset = 0,
} = {}) => {
  try {
    let query_text = `
      SELECT 
        a.log_id,
        a.user_id,
        u.username,
        u.first_name,
        u.last_name,
        a.action_performed,
        a.extended_details,
        a.ip_address,
        a.recorded_timestamp
      FROM audit_log a
      LEFT JOIN users u ON a.user_id = u.user_id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (userId) {
      query_text += ` AND a.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (actionPerformed) {
      query_text += ` AND a.action_performed = $${paramIndex}`;
      params.push(actionPerformed);
      paramIndex++;
    }

    if (startDate) {
      query_text += ` AND a.recorded_timestamp >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query_text += ` AND a.recorded_timestamp <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query_text += `
      ORDER BY a.recorded_timestamp DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await query(query_text, params);

    // Count total
    let countQuery = 'SELECT COUNT(*) as total FROM audit_log WHERE 1=1';
    const countParams = [];
    let countParamIndex = 1;

    if (userId) {
      countQuery += ` AND user_id = $${countParamIndex}`;
      countParams.push(userId);
      countParamIndex++;
    }

    if (actionPerformed) {
      countQuery += ` AND action_performed = $${countParamIndex}`;
      countParams.push(actionPerformed);
      countParamIndex++;
    }

    if (startDate) {
      countQuery += ` AND recorded_timestamp >= $${countParamIndex}`;
      countParams.push(startDate);
      countParamIndex++;
    }

    if (endDate) {
      countQuery += ` AND recorded_timestamp <= $${countParamIndex}`;
      countParams.push(endDate);
      countParamIndex++;
    }

    const countResult = await query(countQuery, countParams);

    return {
      logs: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
      limit,
      offset,
    };
  } catch (error) {
    throw new HttpError(500, 'Error fetching audit log: ' + error.message);
  }
};

/**
 * Get unique actions for audit log
 */
const getAvailableActions = async () => {
  try {
    const result = await query(
      'SELECT DISTINCT action_performed FROM audit_log ORDER BY action_performed'
    );
    return result.rows.map(row => row.action_performed);
  } catch (error) {
    throw new HttpError(500, 'Error fetching available actions: ' + error.message);
  }
};

/**
 * Get audit summary by action
 */
const getAuditSummary = async ({ startDate = null, endDate = null } = {}) => {
  try {
    let query_text = `
      SELECT 
        action_performed,
        COUNT(*) as count
      FROM audit_log
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query_text += ` AND recorded_timestamp >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query_text += ` AND recorded_timestamp <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query_text += `
      GROUP BY action_performed
      ORDER BY count DESC
    `;

    const result = await query(query_text, params);
    return result.rows;
  } catch (error) {
    throw new HttpError(500, 'Error getting audit summary: ' + error.message);
  }
};

module.exports = {
  getAuditLog,
  getAvailableActions,
  getAuditSummary,
};
