const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;

/**
 * Hash a password using bcrypt
 */
const hashPassword = async (password) => {
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters long');
  }
  return bcrypt.hash(password, BCRYPT_ROUNDS);
};

/**
 * Compare a plaintext password with a hash
 */
const verifyPassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

module.exports = {
  hashPassword,
  verifyPassword,
};
