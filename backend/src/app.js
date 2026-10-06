const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const { errorHandler, asyncHandler } = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

/**
 * Security middleware
 */
app.use(helmet());

/**
 * CORS configuration - allow the active Vite ports plus configured origins
 */
const configuredOrigins = [
  process.env.FRONTEND_VISITOR_URL,
  process.env.FRONTEND_ADMIN_URL,
  process.env.CORS_ORIGINS,
].flatMap((value) => (value ? String(value).split(',').map((item) => item.trim()).filter(Boolean) : []));

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:5178',
  'http://localhost:5179',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5176',
  'http://127.0.0.1:5177',
  'http://127.0.0.1:5178',
  'http://127.0.0.1:5179',
];

const allowedOrigins = new Set([...configuredOrigins, ...defaultOrigins]);
const isLocalDevOrigin = (origin) => /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin) || isLocalDevOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

/**
 * Request logging
 */
app.use(morgan('combined'));

/**
 * Body parsing
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

/**
 * API welcome message
 */
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Welcome to iLAB Guiguinto Backend API' });
});

/**
 * API routes
 */
app.use('/api', routes);

/**
 * Liveness probe (Kubernetes/container friendly)
 */
app.get('/live', (req, res) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

/**
 * Readiness probe
 */
app.get('/ready', asyncHandler(async (req, res) => {
  // Check database connection
  const { query } = require('./config/db');
  try {
    await query('SELECT 1');
    res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (error) {
    const message = String(error?.message || error).replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, 'postgres://[redacted]@');
    console.error('Database readiness check failed:', { code: error?.code || error?.name, message });
    res.status(503).json({ status: 'not_ready', error: 'Database unavailable' });
  }
}));

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: {
      status: 404,
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  });
});

/**
 * Centralized error handler (must be last)
 */
app.use(errorHandler);

module.exports = app;
