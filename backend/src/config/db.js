const { Pool } = require('pg');
require('dotenv').config();

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const hasDatabaseParts = process.env.SUPABASE_DB_HOST && process.env.SUPABASE_DB_PASSWORD;

if (!databaseUrl && !hasDatabaseParts) {
  throw new Error('Configure SUPABASE_DB_URL, DATABASE_URL, or the SUPABASE_DB_* variables');
}

const pool = new Pool({
  connectionString: databaseUrl,
  host: databaseUrl ? undefined : process.env.SUPABASE_DB_HOST,
  port: databaseUrl ? undefined : Number(process.env.SUPABASE_DB_PORT || 5432),
  database: databaseUrl ? undefined : process.env.SUPABASE_DB_NAME || 'postgres',
  user: databaseUrl ? undefined : process.env.SUPABASE_DB_USER || 'postgres',
  password: databaseUrl ? undefined : process.env.SUPABASE_DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' || databaseUrl?.includes('supabase') || hasDatabaseParts
    ? { rejectUnauthorized: false }
    : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

/**
 * Execute a query
 */
const query = (text, params) => pool.query(text, params);

/**
 * Helper: Run a function inside a database transaction
 * Ensures atomic operations and allows FOR UPDATE locks
 */
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  query,
  withTransaction,
  pool,
  getClient: () => pool.connect(),
};
