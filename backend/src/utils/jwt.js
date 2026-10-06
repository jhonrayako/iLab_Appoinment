const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'production' ? null : 'your-secret-key'
);
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured when NODE_ENV is production');
}

const signToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error(`Invalid token: ${error.message}`);
  }
};

const decodeToken = (token) => jwt.decode(token);

module.exports = { signToken, verifyToken, decodeToken };
