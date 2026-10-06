const { query } = require('../config/db');
const { HttpError } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');

/**
 * Get all facilities
 */
const getAllFacilities = async ({ isActive = null, limit = 50, offset = 0 } = {}) => {
  try {
    let query_text = `
      SELECT facility_id, facility_name, location, max_capacity, description, is_active, created_at, updated_at
      FROM facilities
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (isActive !== null) {
      query_text += ` AND is_active = $${paramIndex}`;
      params.push(isActive);
      paramIndex++;
    }

    query_text += `
      ORDER BY facility_name
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await query(query_text, params);

    // Count total
    let countQuery = 'SELECT COUNT(*) as total FROM facilities WHERE 1=1';
    const countParams = [];
    let countParamIndex = 1;

    if (isActive !== null) {
      countQuery += ` AND is_active = $${countParamIndex}`;
      countParams.push(isActive);
      countParamIndex++;
    }

    const countResult = await query(countQuery, countParams);

    return {
      facilities: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
      limit,
      offset,
    };
  } catch (error) {
    throw new HttpError(500, 'Error fetching facilities: ' + error.message);
  }
};

/**
 * Get a single facility
 */
const getFacility = async (facilityId) => {
  try {
    const result = await query(
      `SELECT facility_id, facility_name, location, max_capacity, description, is_active, created_at, updated_at
       FROM facilities
       WHERE facility_id = $1`,
      [facilityId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Facility not found');
    }

    return result.rows[0];
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error fetching facility: ' + error.message);
  }
};

/**
 * Create a new facility (Admin-only)
 */
const createFacility = async ({ facilityName, location, maxCapacity, description }, userId, clientIp) => {
  if (!facilityName || !location || !maxCapacity) {
    throw new HttpError(400, 'Missing required fields: facilityName, location, maxCapacity');
  }

  if (maxCapacity <= 0) {
    throw new HttpError(400, 'Max capacity must be greater than 0');
  }

  try {
    const result = await query(
      `INSERT INTO facilities (facility_name, location, max_capacity, description, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING facility_id, facility_name, location, max_capacity, description, is_active, created_at`,
      [facilityName, location, maxCapacity, description || null]
    );

    const facility = result.rows[0];

    // Audit
    await recordAudit({
      userId,
      actionPerformed: 'CREATE_FACILITY',
      extendedDetails: {
        facility_id: facility.facility_id,
        facility_name: facilityName,
        max_capacity: maxCapacity,
      },
      ipAddress: clientIp,
    });

    return facility;
  } catch (error) {
    throw new HttpError(500, 'Error creating facility: ' + error.message);
  }
};

/**
 * Update a facility (Admin-only)
 */
const updateFacility = async (facilityId, updateData, userId, clientIp) => {
  const { facilityName, location, maxCapacity, description, isActive } = updateData;

  try {
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (facilityName !== undefined) {
      updates.push(`facility_name = $${paramIndex}`);
      params.push(facilityName);
      paramIndex++;
    }

    if (location !== undefined) {
      updates.push(`location = $${paramIndex}`);
      params.push(location);
      paramIndex++;
    }

    if (maxCapacity !== undefined) {
      if (maxCapacity <= 0) {
        throw new HttpError(400, 'Max capacity must be greater than 0');
      }
      updates.push(`max_capacity = $${paramIndex}`);
      params.push(maxCapacity);
      paramIndex++;
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(description);
      paramIndex++;
    }

    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(isActive);
      paramIndex++;
    }

    if (updates.length === 0) {
      throw new HttpError(400, 'No fields to update');
    }

    updates.push(`updated_at = NOW()`);
    params.push(facilityId);

    const result = await query(
      `UPDATE facilities SET ${updates.join(', ')}
       WHERE facility_id = $${paramIndex}
       RETURNING facility_id, facility_name, location, max_capacity, description, is_active`,
      params
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Facility not found');
    }

    // Audit
    await recordAudit({
      userId,
      actionPerformed: 'UPDATE_FACILITY',
      extendedDetails: { facility_id: facilityId, updates: updateData },
      ipAddress: clientIp,
    });

    return result.rows[0];
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error updating facility: ' + error.message);
  }
};

/**
 * Get facility capacity status
 */
const getFacilityCapacityStatus = async (facilityId) => {
  try {
    const facility = await getFacility(facilityId);

    // Count active appointments for today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const result = await query(
      `SELECT COUNT(*) as booked
       FROM appointments
       WHERE facility_id = $1
         AND status IN ('Pending', 'Confirmed')
         AND start_time >= $2
         AND end_time <= $3`,
      [facilityId, todayStart.toISOString(), todayEnd.toISOString()]
    );

    const booked = parseInt(result.rows[0].booked, 10);

    return {
      facility_id: facilityId,
      facility_name: facility.facility_name,
      max_capacity: facility.max_capacity,
      booked_today: booked,
      available_today: Math.max(0, facility.max_capacity - booked),
      utilization_percent: Math.round((booked / facility.max_capacity) * 100),
      status: booked >= facility.max_capacity ? 'at_capacity' : 'available',
    };
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error getting capacity status: ' + error.message);
  }
};

module.exports = {
  getAllFacilities,
  getFacility,
  createFacility,
  updateFacility,
  getFacilityCapacityStatus,
};
