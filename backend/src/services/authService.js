const { randomBytes, createHash } = require('crypto');
const { query, withTransaction } = require('../config/db');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { HttpError } = require('../middleware/errorHandler');
const { sendEmail } = require('./notificationsService');

/**
 * Register a new visitor account
 */
const registerVisitor = async ({ username, email, password, firstName, lastName }) => {
  // Validate input
  if (!username || !email || !password || !firstName || !lastName) {
    throw new HttpError(400, 'Missing required fields');
  }

  if (password.length < 8) {
    throw new HttpError(400, 'Password must be at least 8 characters');
  }

  try {
    // Check if user already exists
    const existing = await query(
      'SELECT user_id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existing.rows.length > 0) {
      throw new HttpError(409, 'Username or email already exists');
    }

    // Get Visitor role
    const roleResult = await query(
      "SELECT role_id FROM roles WHERE role_name = 'Visitor'"
    );

    if (roleResult.rows.length === 0) {
      throw new HttpError(500, 'Visitor role not found');
    }

    const visitorRoleId = roleResult.rows[0].role_id;
    const passwordHash = await hashPassword(password);

    // Create user
    const result = await query(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, role_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING user_id, username, email, first_name, last_name, role_id`,
      [username, email, passwordHash, firstName, lastName, visitorRoleId]
    );

    return result.rows[0];
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error registering user: ' + error.message);
  }
};

/**
 * Authenticate user based on role
 * Returns JWT token if credentials are valid
 */
const login = async ({ username, password, role }) => {
  if (!username || !password || !role) {
    throw new HttpError(400, 'Missing username, password, or role');
  }

  try {
    // Get role info
    const roleResult = await query(
      'SELECT role_id, role_name FROM roles WHERE role_name = $1',
      [role]
    );

    if (roleResult.rows.length === 0) {
      throw new HttpError(401, 'Invalid credentials');
    }

    const expectedRoleId = roleResult.rows[0].role_id;
    const roleName = roleResult.rows[0].role_name;

    // Find user by username and role
    const userResult = await query(
      `SELECT user_id, username, email, first_name, last_name, password_hash, role_id, is_active
       FROM users 
       WHERE (username = $1 OR email = $1) AND role_id = $2`,
      [username, expectedRoleId]
    );

    if (userResult.rows.length === 0) {
      // Generic error to prevent role enumeration
      throw new HttpError(401, 'Invalid credentials');
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (!user.is_active) {
      throw new HttpError(401, 'Account is disabled');
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      throw new HttpError(401, 'Invalid credentials');
    }

    // Sign JWT token
    const token = signToken({
      sub: user.user_id,
      username: user.username,
      email: user.email,
      role_id: user.role_id,
      role_name: roleName,
    });

    return {
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role_name: roleName,
      },
    };
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error logging in: ' + error.message);
  }
};

const requestPasswordReset = async ({ email }) => {
  const response = { message: 'If an account matches that email, reset instructions have been sent.' };
  const userResult = await query(
    `SELECT u.user_id, u.email, u.first_name
     FROM users u JOIN roles r ON r.role_id = u.role_id
     WHERE u.email = $1 AND u.is_active = true AND r.role_name = 'Visitor'`,
    [email]
  );
  const user = userResult.rows[0];
  if (!user) return response;

  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await query(
    `UPDATE password_reset_tokens SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`,
    [user.user_id]
  );
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
    [user.user_id, tokenHash]
  );

  const resetUrl = new URL('/reset-password', process.env.FRONTEND_VISITOR_URL || process.env.PUBLIC_APP_URL || 'http://localhost:5173');
  resetUrl.searchParams.set('token', token);
  try {
    await sendEmail({
      to: user.email,
      subject: 'Reset your iLAB visitor password',
      body: `Hello ${user.first_name},\n\nUse this one-time link within 30 minutes to reset your password:\n${resetUrl}\n\nIf you did not request this, you can ignore this message.`,
    });
  } catch (error) {
    console.error('Unable to send visitor password reset email:', error.message);
  }
  return response;
};

const resetPassword = async ({ token, newPassword }) => {
  if (!token || !newPassword) throw new HttpError(400, 'Reset token and new password are required');
  if (newPassword.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const passwordHash = await hashPassword(newPassword);
  return withTransaction(async (client) => {
    const resetResult = await client.query(
      `SELECT reset_token_id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    );
    const reset = resetResult.rows[0];
    if (!reset) throw new HttpError(400, 'This reset link is invalid or has expired.');

    await client.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2',
      [passwordHash, reset.user_id]
    );
    await client.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE reset_token_id = $1',
      [reset.reset_token_id]
    );
    return { message: 'Password reset successfully. You can now sign in.' };
  });
};

const changePassword = async ({ userId, currentPassword, newPassword }) => {
  if (!userId || !currentPassword || !newPassword) {
    throw new HttpError(400, 'Current password and new password are required');
  }

  if (newPassword.length < 8) {
    throw new HttpError(400, 'New password must be at least 8 characters');
  }

  const result = await query(
    'SELECT password_hash FROM users WHERE user_id = $1 AND is_active = true',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new HttpError(404, 'User not found');
  }

  if (!(await verifyPassword(currentPassword, result.rows[0].password_hash))) {
    throw new HttpError(400, 'Current password is incorrect');
  }

  const passwordHash = await hashPassword(newPassword);
  await query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2',
    [passwordHash, userId]
  );

  return { message: 'Password changed successfully' };
};

/**
 * Get current authenticated user
 */
const getCurrentUser = async (userId) => {
  try {
    const result = await query(
      `SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, r.role_name
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       WHERE u.user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new HttpError(404, 'User not found');
    }

    return result.rows[0];
  } catch (error) {
    if (error.status) throw error;
    throw new HttpError(500, 'Error fetching user: ' + error.message);
  }
};

module.exports = {
  registerVisitor,
  login,
  resetPassword,
  changePassword,
  getCurrentUser,
};
