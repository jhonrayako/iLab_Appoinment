import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'ilab-guiguinto-dev-secret';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const db = await open({
  filename: './database/ilab_guiguinto.db',
  driver: sqlite3.Database,
});

const clients = new Set();

async function initializeDatabase() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      role_id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_name TEXT UNIQUE NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (role_id) REFERENCES roles(role_id)
    );

    CREATE TABLE IF NOT EXISTS facilities (
      facility_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      max_capacity INTEGER NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS appointments (
      appointment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      facility_id INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Confirmed', 'Cancelled', 'Completed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id),
      FOREIGN KEY (facility_id) REFERENCES facilities(facility_id)
    );

    CREATE TABLE IF NOT EXISTS logs (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER UNIQUE NOT NULL,
      check_in_time TEXT NOT NULL,
      check_out_time TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id)
    );

    CREATE TABLE IF NOT EXISTS feedback (
      feedback_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      raw_message TEXT NOT NULL,
      sentiment_label TEXT NOT NULL CHECK(sentiment_label IN ('Positive', 'Neutral', 'Negative')),
      submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action_performed TEXT NOT NULL,
      extended_details TEXT,
      ip_address TEXT NOT NULL,
      recorded_timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      permission_id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_id INTEGER NOT NULL,
      permission_name TEXT NOT NULL,
      description TEXT,
      FOREIGN KEY (role_id) REFERENCES roles(role_id),
      UNIQUE(role_id, permission_name)
    );
  `);

  const roleSeed = [
    ['Admin', 'Full system authority'],
    ['Staff', 'Front desk operations and visitor support'],
    ['Visitor', 'Public booking and appointment tracking'],
  ];

  for (const [roleName, description] of roleSeed) {
    const exists = await db.get('SELECT 1 FROM roles WHERE role_name = ?', [roleName]);
    if (!exists) {
      await db.run('INSERT INTO roles (role_name, description) VALUES (?, ?)', [roleName, description]);
    }
  }

  const permissionsByRole = {
    Admin: [
      'MANAGE_USERS',
      'MANAGE_ROLES',
      'MANAGE_FACILITIES',
      'VIEW_ANALYTICS',
      'MANAGE_BOOKINGS',
      'VIEW_AUDIT_LOG',
      'MANAGE_NOTIFICATIONS',
    ],
    Staff: [
      'VIEW_APPOINTMENTS',
      'CHECK_IN_VISITORS',
      'MANAGE_NOTIFICATIONS',
      'VIEW_FACILITY_STATUS',
    ],
    Visitor: [
      'BOOK_APPOINTMENT',
      'VIEW_OWN_APPOINTMENTS',
      'SUBMIT_FEEDBACK',
      'VIEW_OWN_VISIT_LOGS',
    ],
  };

  for (const [roleName, permissions] of Object.entries(permissionsByRole)) {
    const role = await db.get('SELECT role_id FROM roles WHERE role_name = ?', [roleName]);
    if (!role) continue;

    for (const permissionName of permissions) {
      const existing = await db.get(
        'SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_name = ?',
        [role.role_id, permissionName]
      );
      if (!existing) {
        await db.run(
          'INSERT INTO role_permissions (role_id, permission_name, description) VALUES (?, ?, ?)',
          [role.role_id, permissionName, `${roleName} permission: ${permissionName}`]
        );
      }
    }
  }

  const adminExists = await db.get('SELECT 1 FROM users WHERE username = ?', ['admin']);
  if (!adminExists) {
    const adminRole = await db.get('SELECT role_id FROM roles WHERE role_name = ?', ['Admin']);
    const passwordHash = await bcrypt.hash('admin123', 10);
    await db.run(
      'INSERT INTO users (username, password_hash, email, first_name, last_name, role_id) VALUES (?, ?, ?, ?, ?, ?)',
      ['admin', passwordHash, 'admin@ilabguiguinto.ph', 'System', 'Administrator', adminRole.role_id]
    );
  }

  const staffExists = await db.get('SELECT 1 FROM users WHERE username = ?', ['staff']);
  if (!staffExists) {
    const staffRole = await db.get('SELECT role_id FROM roles WHERE role_name = ?', ['Staff']);
    const passwordHash = await bcrypt.hash('staff123', 10);
    await db.run(
      'INSERT INTO users (username, password_hash, email, first_name, last_name, role_id) VALUES (?, ?, ?, ?, ?, ?)',
      ['staff', passwordHash, 'staff@ilabguiguinto.ph', 'Front Desk', 'Staff', staffRole.role_id]
    );
  }

  const facilityCount = await db.get('SELECT COUNT(*) AS count FROM facilities');
  if (facilityCount.count === 0) {
    await db.run(
      'INSERT INTO facilities (name, location, max_capacity, description, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      ['Plant Tissue Lab', 'Guiguinto, Bulacan', 10, 'Tissue culture and propagation facility', 1]
    );
  }
}

async function broadcast(eventName, payload) {
  const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    client.write(message);
  }
}

function issueToken(user) {
  return jwt.sign(
    {
      userId: user.user_id,
      roleId: user.role_id,
      roleName: user.role_name,
      username: user.username,
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function getClientIp(req) {
  return req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
}

function getUserFromToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

const normalizeRoleName = (roleName) => String(roleName ?? '').trim().toLowerCase();

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const normalizedAllowedRoles = allowedRoles.map(normalizeRoleName);
    const userRole = normalizeRoleName(req.user.roleName ?? req.user.role_name ?? req.user.role);

    if (!normalizedAllowedRoles.includes(userRole)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role permissions.' });
    }
    next();
  };
}

function requirePermission(permissionName) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const role = await db.get('SELECT role_id FROM roles WHERE role_name = ?', [req.user.roleName]);
    if (!role) {
      return res.status(403).json({ message: 'Unknown role.' });
    }

    const permission = await db.get(
      'SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_name = ?',
      [role.role_id, permissionName]
    );

    if (!permission) {
      return res.status(403).json({ message: 'Permission denied.' });
    }

    next();
  };
}

async function createAuditLog(actorUserId, action, details, ipAddress) {
  await db.run(
    'INSERT INTO audit_log (user_id, action_performed, extended_details, ip_address, recorded_timestamp) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
    [actorUserId, action, typeof details === 'string' ? details : JSON.stringify(details), ipAddress || 'unknown']
  );
}

async function analyzeSentiment(input) {
  const text = String(input || '').toLowerCase();
  const tokens = text.split(/[^a-z']+/).filter(Boolean);

  const positiveWords = {
    good: 2,
    great: 3,
    excellent: 3,
    friendly: 2,
    helpful: 2,
    smooth: 2,
    pleasant: 2,
    easy: 2,
    informative: 2,
    appreciate: 2,
    clear: 2,
    nice: 2,
    fast: 2,
    efficient: 2,
    professional: 2,
    organized: 2,
    comfortable: 2,
    responsive: 2,
    amazing: 3,
    satisfied: 2,
    wonderful: 3,
  };

  const negativeWords = {
    bad: 2,
    poor: 2,
    slow: 2,
    confusing: 2,
    unhelpful: 2,
    late: 2,
    issue: 2,
    problem: 2,
    difficult: 2,
    frustrating: 3,
    rude: 3,
    unclear: 2,
    delay: 2,
    broken: 2,
    crowded: 2,
    unavailable: 2,
    disappointing: 3,
    messy: 2,
    inefficient: 2,
  };

  const intensifiers = {
    very: 1.2,
    extremely: 1.4,
    really: 1.1,
    highly: 1.3,
    super: 1.4,
    quite: 1.1,
  };

  const negations = new Set(['not', 'never', 'no', 'hardly', 'barely', 'cannot', 'can\'t', 'dont', 'don\'t', 'isnt', 'isn\'t', 'wasnt', 'wasn\'t', 'doesnt', 'doesn\'t']);

  let score = 0;
  let negateNext = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (negations.has(token)) {
      negateNext = true;
      continue;
    }

    if (token in intensifiers) {
      const nextToken = tokens[index + 1];
      if (nextToken && (positiveWords[nextToken] || negativeWords[nextToken])) {
        score += (positiveWords[nextToken] || negativeWords[nextToken]) * intensifiers[token];
        if (negativeWords[nextToken]) score -= (negativeWords[nextToken] || 0) * intensifiers[token];
        if (positiveWords[nextToken]) score += (positiveWords[nextToken] || 0) * intensifiers[token];
        index += 1;
      }
      continue;
    }

    const positive = positiveWords[token] || 0;
    const negative = negativeWords[token] || 0;

    if (positive || negative) {
      const modifier = negateNext ? -1 : 1;
      score += modifier * positive;
      score -= modifier * negative;
      negateNext = false;
    }
  }

  if (/(thank you|amazing|love it|excellent service|very satisfied)/.test(text)) score += 2;
  if (/(very poor|very bad|terrible|awful|horrible)/.test(text)) score -= 3;

  if (score > 2) return 'Positive';
  if (score < -2) return 'Negative';
  return 'Neutral';
}

async function createNotification(userId, title, message) {
  const result = await db.run(
    'INSERT INTO notifications (user_id, title, message, is_read, created_at) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)',
    [userId, title, message]
  );

  const notification = await db.get('SELECT * FROM notifications WHERE notification_id = ?', [result.lastID]);
  await broadcast('notification', { notification });
  return notification;
}

async function validateCapacity(facilityId, startTime, endTime, ignoreAppointmentId = null) {
  const facility = await db.get('SELECT max_capacity FROM facilities WHERE facility_id = ? AND is_active = 1', [facilityId]);
  if (!facility) {
    throw new Error('Facility not found or inactive.');
  }

  const overlapCheck = ignoreAppointmentId
    ? 'SELECT COUNT(*) AS count FROM appointments WHERE facility_id = ? AND status IN (\'Pending\', \'Confirmed\') AND appointment_id != ? AND start_time < ? AND end_time > ?'
    : 'SELECT COUNT(*) AS count FROM appointments WHERE facility_id = ? AND status IN (\'Pending\', \'Confirmed\') AND start_time < ? AND end_time > ?';

  const params = ignoreAppointmentId
    ? [facilityId, ignoreAppointmentId, endTime, startTime]
    : [facilityId, endTime, startTime];

  const countRow = await db.get(overlapCheck, params);
  if (Number(countRow.count) >= Number(facility.max_capacity)) {
    return { valid: false, message: 'Selected time slot is full. Please choose another time slot.' };
  }

  return { valid: true, facility };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'iLAB Guiguinto VMS API' });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, email, first_name, last_name } = req.body;
    if (!username || !password || !email || !first_name || !last_name) {
      return res.status(400).json({ message: 'All visitor registration fields are required.' });
    }

    const existing = await db.get('SELECT 1 FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) {
      return res.status(409).json({ message: 'Username or email already exists.' });
    }

    const visitorRole = await db.get('SELECT role_id, role_name FROM roles WHERE role_name = ?', ['Visitor']);
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO users (username, password_hash, email, first_name, last_name, role_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [username, passwordHash, email, first_name, last_name, visitorRole.role_id]
    );

    const user = await db.get(
      'SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, u.role_id, r.role_name AS role FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?',
      [result.lastID]
    );
    const token = issueToken(user);

    await createAuditLog(user.user_id, 'REGISTER_VISITOR', { username, email }, getClientIp(req));

    return res.status(201).json({
      message: 'Visitor registered successfully.',
      token,
      user: { ...user, role: user.role },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Registration failed.', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username/email and password are required.' });
    }

    const user = await db.get(
      `SELECT u.*, r.role_name
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       WHERE u.username = ? OR u.email = ?`,
      [username, username]
    );

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = issueToken(user);
    return res.json({
      message: 'Login successful.',
      token,
      user: { ...user, password_hash: undefined, role: user.role_name },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Login failed.', error: error.message });
  }
});

app.post('/api/auth/logout', getUserFromToken, async (req, res) => {
  await createAuditLog(req.user.userId, 'LOGOUT', { username: req.user.username }, getClientIp(req));
  return res.json({ message: 'Logged out successfully.' });
});

app.post('/api/auth/password-reset', getUserFromToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ message: 'Current and new password are required.' });
    }

    const user = await db.get('SELECT * FROM users WHERE user_id = ?', [req.user.userId]);
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    if (new_password.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }

    const passwordHash = await bcrypt.hash(new_password, 10);
    await db.run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [passwordHash, req.user.userId]);
    await createAuditLog(req.user.userId, 'PASSWORD_RESET', { username: req.user.username }, getClientIp(req));

    return res.json({ message: 'Password reset successful.' });
  } catch (error) {
    return res.status(500).json({ message: 'Password reset failed.', error: error.message });
  }
});

app.get('/api/me', getUserFromToken, async (req, res) => {
  const user = await db.get(
    `SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, r.role_name AS role
     FROM users u
     JOIN roles r ON u.role_id = r.role_id
     WHERE u.user_id = ?`,
    [req.user.userId]
  );
  return res.json({ user });
});

app.get('/api/roles', getUserFromToken, requireRole('Admin'), async (req, res) => {
  const roles = await db.all('SELECT * FROM roles ORDER BY role_id ASC');
  return res.json({ roles });
});

app.post('/api/roles', getUserFromToken, requireRole('Admin'), async (req, res) => {
  const { role_name, description } = req.body;
  if (!role_name) {
    return res.status(400).json({ message: 'Role name is required.' });
  }

  const existing = await db.get('SELECT 1 FROM roles WHERE role_name = ?', [role_name]);
  if (existing) {
    return res.status(409).json({ message: 'Role already exists.' });
  }

  const result = await db.run('INSERT INTO roles (role_name, description) VALUES (?, ?)', [role_name, description || null]);
  const role = await db.get('SELECT * FROM roles WHERE role_id = ?', [result.lastID]);
  await createAuditLog(req.user.userId, 'CREATE_ROLE', { role }, getClientIp(req));

  return res.status(201).json({ role });
});

app.put('/api/roles/:id', getUserFromToken, requireRole('Admin'), async (req, res) => {
  const { id } = req.params;
  const { role_name, description } = req.body;

  const existing = await db.get('SELECT * FROM roles WHERE role_id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ message: 'Role not found.' });
  }

  await db.run(
    'UPDATE roles SET role_name = ?, description = ? WHERE role_id = ?',
    [role_name || existing.role_name, description ?? existing.description, id]
  );

  const updated = await db.get('SELECT * FROM roles WHERE role_id = ?', [id]);
  await createAuditLog(req.user.userId, 'UPDATE_ROLE', { previous: existing, updated }, getClientIp(req));
  return res.json({ role: updated });
});

app.delete('/api/roles/:id', getUserFromToken, requireRole('Admin'), async (req, res) => {
  const { id } = req.params;
  const role = await db.get('SELECT * FROM roles WHERE role_id = ?', [id]);
  if (!role) {
    return res.status(404).json({ message: 'Role not found.' });
  }

  await db.run('DELETE FROM role_permissions WHERE role_id = ?', [id]);
  await db.run('DELETE FROM roles WHERE role_id = ?', [id]);
  await createAuditLog(req.user.userId, 'DELETE_ROLE', { deletedRole: role }, getClientIp(req));

  return res.json({ message: 'Role deleted.', role });
});

app.get('/api/role-permissions', getUserFromToken, requireRole('Admin'), async (req, res) => {
  const permissions = await db.all('SELECT rp.*, r.role_name FROM role_permissions rp JOIN roles r ON rp.role_id = r.role_id ORDER BY r.role_id, rp.permission_name');
  return res.json({ permissions });
});

app.post('/api/role-permissions', getUserFromToken, requireRole('Admin'), async (req, res) => {
  const { role_id, permission_name, description } = req.body;
  if (!role_id || !permission_name) {
    return res.status(400).json({ message: 'Role and permission name are required.' });
  }

  const roleExists = await db.get('SELECT 1 FROM roles WHERE role_id = ?', [role_id]);
  if (!roleExists) {
    return res.status(404).json({ message: 'Role not found.' });
  }

  const existing = await db.get('SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_name = ?', [role_id, permission_name]);
  if (existing) {
    return res.status(409).json({ message: 'Permission mapping already exists.' });
  }

  const result = await db.run(
    'INSERT INTO role_permissions (role_id, permission_name, description) VALUES (?, ?, ?)',
    [role_id, permission_name, description || null]
  );

  const permission = await db.get('SELECT * FROM role_permissions WHERE permission_id = ?', [result.lastID]);
  await createAuditLog(req.user.userId, 'CREATE_PERMISSION_MAPPING', { permission }, getClientIp(req));

  return res.status(201).json({ permission });
});

app.get('/api/users', getUserFromToken, requireRole('Admin'), async (req, res) => {
  const users = await db.all(`
    SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, r.role_name AS role
    FROM users u
    JOIN roles r ON u.role_id = r.role_id
    ORDER BY u.user_id DESC
  `);
  return res.json({ users });
});

app.get('/api/users/:id', getUserFromToken, async (req, res) => {
  const { id } = req.params;
  const isAdmin = req.user.roleName === 'Admin';
  const isSelf = Number(req.user.userId) === Number(id);

  if (!isAdmin && !isSelf) {
    return res.status(403).json({ message: 'You may only view your own account.' });
  }

  const user = await db.get(
    `SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, r.role_name AS role
     FROM users u
     JOIN roles r ON u.role_id = r.role_id
     WHERE u.user_id = ?`,
    [id]
  );

  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  return res.json({ user });
});

app.post('/api/users', getUserFromToken, requireRole('Admin'), async (req, res) => {
  const { username, password, email, first_name, last_name, role_name } = req.body;
  if (!username || !password || !email || !first_name || !last_name || !role_name) {
    return res.status(400).json({ message: 'User details and role are required.' });
  }

  const role = await db.get('SELECT role_id FROM roles WHERE role_name = ?', [role_name]);
  if (!role) {
    return res.status(404).json({ message: 'Role not found.' });
  }

  const existing = await db.get('SELECT 1 FROM users WHERE username = ? OR email = ?', [username, email]);
  if (existing) {
    return res.status(409).json({ message: 'Username or email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await db.run(
    'INSERT INTO users (username, password_hash, email, first_name, last_name, role_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    [username, passwordHash, email, first_name, last_name, role.role_id]
  );

  const user = await db.get(
    `SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, r.role_name AS role
     FROM users u
     JOIN roles r ON u.role_id = r.role_id
     WHERE u.user_id = ?`,
    [result.lastID]
  );

  await createAuditLog(req.user.userId, 'CREATE_USER', { user }, getClientIp(req));
  return res.status(201).json({ user });
});

app.put('/api/users/:id', getUserFromToken, async (req, res) => {
  const { id } = req.params;
  const isAdmin = req.user.roleName === 'Admin';
  const isSelf = Number(req.user.userId) === Number(id);

  if (!isAdmin && !isSelf) {
    return res.status(403).json({ message: 'You may only update your own account.' });
  }

  const existing = await db.get('SELECT * FROM users WHERE user_id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ message: 'User not found.' });
  }

  const nextData = {
    username: req.body.username || existing.username,
    email: req.body.email || existing.email,
    first_name: req.body.first_name || existing.first_name,
    last_name: req.body.last_name || existing.last_name,
  };

  if (req.body.role_name && isAdmin) {
    const role = await db.get('SELECT role_id FROM roles WHERE role_name = ?', [req.body.role_name]);
    if (!role) {
      return res.status(404).json({ message: 'Role not found.' });
    }
    nextData.role_id = role.role_id;
  }

  await db.run(
    'UPDATE users SET username = ?, email = ?, first_name = ?, last_name = ?, role_id = COALESCE(?, role_id), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
    [nextData.username, nextData.email, nextData.first_name, nextData.last_name, nextData.role_id || null, id]
  );

  const updated = await db.get(
    `SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, r.role_name AS role
     FROM users u
     JOIN roles r ON u.role_id = r.role_id
     WHERE u.user_id = ?`,
    [id]
  );

  await createAuditLog(req.user.userId, 'UPDATE_USER', { previous: existing, updated }, getClientIp(req));
  return res.json({ user: updated });
});

app.delete('/api/users/:id', getUserFromToken, requireRole('Admin'), async (req, res) => {
  const { id } = req.params;
  const user = await db.get('SELECT * FROM users WHERE user_id = ?', [id]);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  await db.run('DELETE FROM users WHERE user_id = ?', [id]);
  await createAuditLog(req.user.userId, 'DELETE_USER', { deletedUser: user }, getClientIp(req));
  return res.json({ message: 'User deleted.', user });
});

app.get('/api/facilities', async (req, res) => {
  const facilities = await db.all('SELECT * FROM facilities WHERE is_active = 1 ORDER BY facility_id DESC');
  return res.json({ facilities });
});

app.post('/api/facilities', getUserFromToken, requireRole('Admin'), async (req, res) => {
  const { name, location, max_capacity, description, is_active } = req.body;
  if (!name || !location || !max_capacity) {
    return res.status(400).json({ message: 'Facility name, location, and capacity are required.' });
  }

  const result = await db.run(
    'INSERT INTO facilities (name, location, max_capacity, description, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    [name, location, Number(max_capacity), description || null, is_active === false ? 0 : 1]
  );

  const facility = await db.get('SELECT * FROM facilities WHERE facility_id = ?', [result.lastID]);
  await createAuditLog(req.user.userId, 'CREATE_FACILITY', { facility }, getClientIp(req));
  await broadcast('facility-update', { facility, action: 'created' });

  return res.status(201).json({ facility });
});

app.put('/api/facilities/:id', getUserFromToken, requireRole('Admin'), async (req, res) => {
  const { id } = req.params;
  const facility = await db.get('SELECT * FROM facilities WHERE facility_id = ?', [id]);
  if (!facility) {
    return res.status(404).json({ message: 'Facility not found.' });
  }

  const nextFacility = {
    name: req.body.name || facility.name,
    location: req.body.location || facility.location,
    max_capacity: req.body.max_capacity ?? facility.max_capacity,
    description: req.body.description ?? facility.description,
    is_active: req.body.is_active ?? facility.is_active,
  };

  await db.run(
    'UPDATE facilities SET name = ?, location = ?, max_capacity = ?, description = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE facility_id = ?',
    [nextFacility.name, nextFacility.location, Number(nextFacility.max_capacity), nextFacility.description, Number(nextFacility.is_active), id]
  );

  const updated = await db.get('SELECT * FROM facilities WHERE facility_id = ?', [id]);
  await createAuditLog(req.user.userId, 'UPDATE_FACILITY', { previous: facility, updated }, getClientIp(req));
  await broadcast('facility-update', { facility: updated, action: 'updated' });

  return res.json({ facility: updated });
});

app.post('/api/appointments', getUserFromToken, async (req, res) => {
  const { facility_id, start_time, end_time, purpose } = req.body;

  if (!facility_id || !start_time || !end_time) {
    return res.status(400).json({ message: 'Facility and appointment time range are required.' });
  }

  try {
    const capacityCheck = await validateCapacity(Number(facility_id), start_time, end_time);
    if (!capacityCheck.valid) {
      return res.status(409).json({ message: capacityCheck.message });
    }

    const result = await db.run(
      'INSERT INTO appointments (user_id, facility_id, start_time, end_time, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [req.user.userId, facility_id, start_time, end_time, 'Pending']
    );

    const appointment = await db.get('SELECT * FROM appointments WHERE appointment_id = ?', [result.lastID]);
    await createAuditLog(req.user.userId, 'CREATE_BOOKING', { appointment, purpose }, getClientIp(req));
    await broadcast('appointment-update', { appointment, action: 'created' });

    const facility = await db.get('SELECT * FROM facilities WHERE facility_id = ?', [facility_id]);
    if (facility) {
      await createNotification(req.user.userId, 'Appointment Request Created', `Your booking request for ${facility.name} has been created.`);
    }

    return res.status(201).json({ message: 'Appointment created successfully.', appointment });
  } catch (error) {
    return res.status(500).json({ message: 'Appointment creation failed.', error: error.message });
  }
});

app.get('/api/appointments', getUserFromToken, async (req, res) => {
  let query = `
    SELECT a.*, f.name AS facility_name, u.first_name || ' ' || u.last_name AS visitor_name
    FROM appointments a
    JOIN facilities f ON a.facility_id = f.facility_id
    JOIN users u ON a.user_id = u.user_id
  `;
  let params = [];

  if (req.user.roleName === 'Visitor') {
    query += ' WHERE a.user_id = ?';
    params.push(req.user.userId);
  }

  query += ' ORDER BY a.start_time DESC';
  const appointments = await db.all(query, params);
  return res.json({ appointments });
});

app.get('/api/appointments/:id', getUserFromToken, async (req, res) => {
  const { id } = req.params;
  const appointment = await db.get(`
    SELECT a.*, f.name AS facility_name, u.first_name || ' ' || u.last_name AS visitor_name
    FROM appointments a
    JOIN facilities f ON a.facility_id = f.facility_id
    JOIN users u ON a.user_id = u.user_id
    WHERE a.appointment_id = ?
  `, [id]);

  if (!appointment) {
    return res.status(404).json({ message: 'Appointment not found.' });
  }

  if (req.user.roleName !== 'Admin' && Number(req.user.userId) !== Number(appointment.user_id)) {
    return res.status(403).json({ message: 'Access denied.' });
  }

  return res.json({ appointment });
});

app.put('/api/appointments/:id', getUserFromToken, async (req, res) => {
  const { id } = req.params;
  const appointment = await db.get('SELECT * FROM appointments WHERE appointment_id = ?', [id]);
  if (!appointment) {
    return res.status(404).json({ message: 'Appointment not found.' });
  }

  const isAdmin = req.user.roleName === 'Admin';
  const isOwner = Number(req.user.userId) === Number(appointment.user_id);
  if (!isAdmin && !isOwner) {
    return res.status(403).json({ message: 'You cannot modify this appointment.' });
  }

  const { facility_id, start_time, end_time, status } = req.body;
  const nextFacilityId = facility_id ?? appointment.facility_id;
  const nextStartTime = start_time ?? appointment.start_time;
  const nextEndTime = end_time ?? appointment.end_time;
  const nextStatus = status ?? appointment.status;

  const capacityCheck = await validateCapacity(Number(nextFacilityId), nextStartTime, nextEndTime, Number(id));
  if (!capacityCheck.valid) {
    return res.status(409).json({ message: capacityCheck.message });
  }

  await db.run(
    'UPDATE appointments SET facility_id = ?, start_time = ?, end_time = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE appointment_id = ?',
    [nextFacilityId, nextStartTime, nextEndTime, nextStatus, id]
  );

  const updated = await db.get('SELECT * FROM appointments WHERE appointment_id = ?', [id]);
  await createAuditLog(req.user.userId, 'UPDATE_BOOKING', { previous: appointment, updated }, getClientIp(req));
  await broadcast('appointment-update', { appointment: updated, action: 'updated' });

  return res.json({ message: 'Appointment updated.', appointment: updated });
});

app.post('/api/appointments/:id/cancel', getUserFromToken, async (req, res) => {
  const { id } = req.params;
  const appointment = await db.get('SELECT * FROM appointments WHERE appointment_id = ?', [id]);
  if (!appointment) {
    return res.status(404).json({ message: 'Appointment not found.' });
  }

  if (req.user.roleName !== 'Admin' && Number(appointment.user_id) !== Number(req.user.userId)) {
    return res.status(403).json({ message: 'You cannot cancel another visitor’s appointment.' });
  }

  await db.run('UPDATE appointments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE appointment_id = ?', ['Cancelled', id]);
  const updated = await db.get('SELECT * FROM appointments WHERE appointment_id = ?', [id]);

  await createAuditLog(req.user.userId, 'CANCEL_BOOKING', { appointment: updated }, getClientIp(req));
  await broadcast('appointment-update', { appointment: updated, action: 'cancelled' });

  await createNotification(appointment.user_id, 'Booking Cancelled', 'Your appointment has been cancelled successfully.');
  return res.json({ message: 'Appointment cancelled.', appointment: updated });
});

app.get('/api/notifications', getUserFromToken, async (req, res) => {
  const notifications = await db.all(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 25',
    [req.user.userId]
  );
  return res.json({ notifications });
});

app.post('/api/notifications/:id/read', getUserFromToken, async (req, res) => {
  const { id } = req.params;
  await db.run('UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND user_id = ?', [id, req.user.userId]);
  return res.json({ message: 'Notification marked as read.' });
});

app.post('/api/logs', getUserFromToken, requireRole('Admin'), async (req, res) => {
  const { appointment_id, check_in_time, check_out_time } = req.body;
  if (!appointment_id || !check_in_time) {
    return res.status(400).json({ message: 'Appointment ID and check-in time are required.' });
  }

  const appointment = await db.get('SELECT * FROM appointments WHERE appointment_id = ?', [appointment_id]);
  if (!appointment) {
    return res.status(404).json({ message: 'Appointment not found.' });
  }

  const existing = await db.get('SELECT * FROM logs WHERE appointment_id = ?', [appointment_id]);
  if (existing) {
    return res.status(409).json({ message: 'A log entry already exists for this appointment. Use the update endpoint to modify it.' });
  }

  const result = await db.run(
    'INSERT INTO logs (appointment_id, check_in_time, check_out_time, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
    [appointment_id, check_in_time, check_out_time || null]
  );

  const log = await db.get('SELECT * FROM logs WHERE log_id = ?', [result.lastID]);
  await createAuditLog(req.user.userId, 'CHECK_IN_LOG', { appointment_id, log }, getClientIp(req));
  await broadcast('checkin-update', { log, action: 'created' });

  return res.status(201).json({ log });
});

app.put('/api/logs/:id', getUserFromToken, requireRole('Admin'), async (req, res) => {
  const { id } = req.params;
  const { check_in_time, check_out_time } = req.body;
  const existing = await db.get('SELECT * FROM logs WHERE log_id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ message: 'Log not found.' });
  }

  await db.run(
    'UPDATE logs SET check_in_time = ?, check_out_time = ? WHERE log_id = ?',
    [check_in_time || existing.check_in_time, check_out_time ?? existing.check_out_time, id]
  );

  const updated = await db.get('SELECT * FROM logs WHERE log_id = ?', [id]);
  await createAuditLog(req.user.userId, 'UPDATE_CHECK_IN_LOG', { previous: existing, updated }, getClientIp(req));
  await broadcast('checkin-update', { log: updated, action: 'updated' });

  return res.json({ log: updated });
});

app.get('/api/logs', getUserFromToken, async (req, res) => {
  let query = `
    SELECT l.*, a.user_id, a.facility_id, f.name AS facility_name
    FROM logs l
    JOIN appointments a ON l.appointment_id = a.appointment_id
    JOIN facilities f ON a.facility_id = f.facility_id
  `;
  const params = [];

  if (req.user.roleName === 'Visitor') {
    query += ' WHERE a.user_id = ?';
    params.push(req.user.userId);
  }

  query += ' ORDER BY l.created_at DESC';
  const logs = await db.all(query, params);
  return res.json({ logs });
});

app.post('/api/feedback', getUserFromToken, async (req, res) => {
  const { raw_message, sentiment_label } = req.body;
  if (!raw_message) {
    return res.status(400).json({ message: 'Feedback text is required.' });
  }

  const sentiment = sentiment_label || (await analyzeSentiment(raw_message));
  const result = await db.run(
    'INSERT INTO feedback (user_id, raw_message, sentiment_label, submitted_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
    [req.user.userId, raw_message, sentiment]
  );

  const record = await db.get('SELECT * FROM feedback WHERE feedback_id = ?', [result.lastID]);
  await createAuditLog(req.user.userId, 'SUBMIT_FEEDBACK', { feedback_id: record.feedback_id }, getClientIp(req));
  await broadcast('feedback-update', { feedback: record, action: 'submitted' });

  return res.status(201).json({ message: 'Feedback stored successfully.', feedback: record });
});

app.get('/api/feedback', getUserFromToken, async (req, res) => {
  if (req.user.roleName !== 'Admin') {
    const feedback = await db.all('SELECT * FROM feedback WHERE user_id = ? ORDER BY submitted_at DESC', [req.user.userId]);
    return res.json({ feedback });
  }

  const feedback = await db.all('SELECT * FROM feedback ORDER BY submitted_at DESC');
  return res.json({ feedback });
});

app.get('/api/analytics/summary', getUserFromToken, requireRole('Admin'), async (req, res) => {
  const totalVisitors = await db.get('SELECT COUNT(*) AS count FROM users WHERE role_id IN (SELECT role_id FROM roles WHERE role_name = ?)', ['Visitor']);
  const totalAppointments = await db.get('SELECT COUNT(*) AS count FROM appointments');
  const activeFacilities = await db.get('SELECT COUNT(*) AS count FROM facilities WHERE is_active = 1');
  const completedVisits = await db.get('SELECT COUNT(*) AS count FROM logs');

  return res.json({
    summary: {
      totalVisitors: Number(totalVisitors.count),
      totalAppointments: Number(totalAppointments.count),
      activeFacilities: Number(activeFacilities.count),
      completedVisits: Number(completedVisits.count),
    },
  });
});

app.get('/api/analytics/sentiment', getUserFromToken, requireRole('Admin'), async (req, res) => {
  const summary = await db.all(
    'SELECT sentiment_label AS label, COUNT(*) AS count FROM feedback GROUP BY sentiment_label ORDER BY sentiment_label'
  );
  return res.json({ summary });
});

app.get('/api/analytics/export/attendance.csv', getUserFromToken, requireRole('Admin'), async (req, res) => {
  const rows = await db.all(`
    SELECT u.username, f.name AS facility_name, a.start_time, a.end_time, l.check_in_time, l.check_out_time, a.status
    FROM appointments a
    JOIN users u ON a.user_id = u.user_id
    JOIN facilities f ON a.facility_id = f.facility_id
    LEFT JOIN logs l ON l.appointment_id = a.appointment_id
    ORDER BY a.start_time DESC
  `);

  const header = ['username', 'facility_name', 'start_time', 'end_time', 'check_in_time', 'check_out_time', 'status'];
  const csvLines = [header.join(',')];
  for (const row of rows) {
    csvLines.push(
      [
        row.username,
        row.facility_name,
        row.start_time,
        row.end_time,
        row.check_in_time || '',
        row.check_out_time || '',
        row.status,
      ].map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')
    );
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="attendance.csv"');
  return res.send(csvLines.join('\n'));
});

app.get('/api/audit-log', getUserFromToken, requireRole('Admin'), async (req, res) => {
  const logs = await db.all('SELECT * FROM audit_log ORDER BY recorded_timestamp DESC LIMIT 100');
  return res.json({ logs });
});

app.get('/api/realtime/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const client = res;
  clients.add(client);
  client.write('event: connected\ndata: {"status":"connected"}\n\n');

  req.on('close', () => {
    clients.delete(client);
  });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Endpoint not found.' });
});

await initializeDatabase();

app.listen(PORT, () => {
  console.log(`iLAB Guiguinto VMS API running on http://localhost:${PORT}`);
});
