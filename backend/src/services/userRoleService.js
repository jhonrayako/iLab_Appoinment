const { query } = require('../config/db');
const { HttpError } = require('../middleware/errorHandler');
const { recordAudit, getClientIp } = require('../utils/audit');
const { hashPassword } = require('../utils/password');

/**
 * Get all roles
 */
const getAllRoles = async () => {
  try {
    const result = await query(
      'SELECT role_id, role_name, description, created_at FROM roles ORDER BY role_name'
    );
    return result.rows;
  } catch (error) {
    throw new HttpError(500, 'Error fetching roles: ' + error.message);
  }
};

/**
 * Create a new role (Admin-only)
 */
const createRole = async ({ roleName, description }, userId, clientIp) => {
  if (!roleName) {
    throw new HttpError(400, 'Role name is required');
  }

  try {
    const result = await query(
      `INSERT INTO roles (role_name, description)
       VALUES ($1, $2)
       RETURNING role_id, role_name, description, created_at`,
      [roleName, description || null]
    );

    // Audit
    await recordAudit({
      userId,
      actionPerformed: 'CREATE_ROLE',
      extendedDetails: { role_name: roleName },
      ipAddress: clientIp,
    });

    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'Role already exists');
    }
    throw new HttpError(500, 'Error creating role: ' + error.message);
  }
};

/**
 * Update a role (Admin-only)
 */
const updateRole = async (roleId, { description }, userId, clientIp) => {
  try {
    const result = await query(
      `UPDATE roles SET description = $1, updated_at = NOW()
       WHERE role_id = $2
       RETURNING role_id, role_name, description`,
      [description || null, roleId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'Role not found');
    }

    await recordAudit({
      userId,
      actionPerformed: 'UPDATE_ROLE',
      extendedDetails: { role_id: roleId, description },
      ipAddress: clientIp,
    });

    return result.rows[0];
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error updating role: ' + error.message);
  }
};

/**
 * Get all users (Admin-only)
 */
const getAllUsers = async ({ limit = 50, offset = 0, roleId = null, isActive = null } = {}) => {
  try {
    let query_text = `
      SELECT u.user_id, u.username, u.email, u.first_name, u.last_name,
             u.is_active, r.role_name, u.created_at, u.updated_at
      FROM users u
      JOIN roles r ON u.role_id = r.role_id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (roleId) {
      query_text += ` AND u.role_id = $${paramIndex}`;
      params.push(roleId);
      paramIndex++;
    }

    if (isActive !== null) {
      query_text += ` AND u.is_active = $${paramIndex}`;
      params.push(isActive);
      paramIndex++;
    }

    query_text += `
      ORDER BY u.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await query(query_text, params);

    // Count total
    let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
    const countParams = [];
    let countParamIndex = 1;

    if (roleId) {
      countQuery += ` AND role_id = $${countParamIndex}`;
      countParams.push(roleId);
      countParamIndex++;
    }

    if (isActive !== null) {
      countQuery += ` AND is_active = $${countParamIndex}`;
      countParams.push(isActive);
      countParamIndex++;
    }

    const countResult = await query(countQuery, countParams);

    return {
      users: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
      limit,
      offset,
    };
  } catch (error) {
    throw new HttpError(500, 'Error fetching users: ' + error.message);
  }
};

/**
 * Create a user (Admin-only - for Admin/Researcher)
 */
const createUser = async ({ username, email, password, firstName, lastName, roleId }, userId, clientIp) => {
  if (!username || !email || !password || !firstName || !lastName || !roleId) {
    throw new HttpError(400, 'Missing required fields');
  }

  if (password.length < 6) {
    throw new HttpError(400, 'Password must be at least 6 characters');
  }

  try {
    const passwordHash = await hashPassword(password);

    const result = await query(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, role_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING user_id, username, email, first_name, last_name, role_id`,
      [username, email, passwordHash, firstName, lastName, roleId]
    );

    const newUser = result.rows[0];

    // Audit
    await recordAudit({
      userId,
      actionPerformed: 'CREATE_USER',
      extendedDetails: { 
        new_user_id: newUser.user_id,
        username,
        email,
        role_id: roleId,
      },
      ipAddress: clientIp,
    });

    return newUser;
  } catch (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'Username or email already exists');
    }
    throw new HttpError(500, 'Error creating user: ' + error.message);
  }
};

/**
 * Update a user (Admin-only)
 */
const updateUser = async (targetUserId, updateData, userId, clientIp) => {
  const { email, firstName, lastName, roleId, isActive } = updateData;

  try {
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (email !== undefined) {
      updates.push(`email = $${paramIndex}`);
      params.push(email);
      paramIndex++;
    }

    if (firstName !== undefined) {
      updates.push(`first_name = $${paramIndex}`);
      params.push(firstName);
      paramIndex++;
    }

    if (lastName !== undefined) {
      updates.push(`last_name = $${paramIndex}`);
      params.push(lastName);
      paramIndex++;
    }

    if (roleId !== undefined) {
      updates.push(`role_id = $${paramIndex}`);
      params.push(roleId);
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
    params.push(targetUserId);

    const result = await query(
      `UPDATE users SET ${updates.join(', ')}
       WHERE user_id = $${paramIndex}
       RETURNING user_id, username, email, first_name, last_name, role_id, is_active`,
      params
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'User not found');
    }

    // Audit
    await recordAudit({
      userId,
      actionPerformed: 'UPDATE_USER',
      extendedDetails: { target_user_id: targetUserId, updates: updateData },
      ipAddress: clientIp,
    });

    return result.rows[0];
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error updating user: ' + error.message);
  }
};

/**
 * Deactivate a user (soft delete)
 */
const deactivateUser = async (targetUserId, userId, clientIp) => {
  if (targetUserId === userId) {
    throw new HttpError(400, 'Cannot deactivate your own account');
  }

  try {
    const result = await query(
      `UPDATE users SET is_active = false, updated_at = NOW()
       WHERE user_id = $1
       RETURNING user_id, username, email, is_active`,
      [targetUserId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'User not found');
    }

    // Audit
    await recordAudit({
      userId,
      actionPerformed: 'DEACTIVATE_USER',
      extendedDetails: { target_user_id: targetUserId },
      ipAddress: clientIp,
    });

    return result.rows[0];
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error deactivating user: ' + error.message);
  }
};

/**
 * Reset a user's password (Admin-only)
 */
const resetUserPassword = async (targetUserId, newPassword, userId, clientIp) => {
  if (!newPassword || newPassword.length < 6) {
    throw new HttpError(400, 'Password must be at least 6 characters');
  }

  try {
    const passwordHash = await hashPassword(newPassword);

    const result = await query(
      `UPDATE users SET password_hash = $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING user_id, username, email`,
      [passwordHash, targetUserId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'User not found');
    }

    // Audit
    await recordAudit({
      userId,
      actionPerformed: 'RESET_USER_PASSWORD',
      extendedDetails: { target_user_id: targetUserId },
      ipAddress: clientIp,
    });

    return result.rows[0];
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error resetting password: ' + error.message);
  }
};

module.exports = {
  getAllRoles,
  createRole,
  updateRole,
  getAllUsers,
  createUser,
  updateUser,
  deactivateUser,
  resetUserPassword,
};
